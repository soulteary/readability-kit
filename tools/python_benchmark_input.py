"""Incremental decoder for the benchmark request object.

Retains decoded cases (required to share identical ordering across runtimes), but
never constructs one Unicode string containing the whole batch. The parser
window is bounded by a chunk plus the largest individual JSON value. Extraction
still starts after complete input validation, outside the timed region.
"""
import codecs
import json


class _Reader:
    def __init__(self, stream, chunk_size, max_value_chars):
        self.stream = stream
        self.chunk_size = chunk_size
        self.max_value_chars = max_value_chars
        self.text = ''
        self.position = 0
        self.eof = False
        self.utf8 = codecs.getincrementaldecoder('utf-8')()
        self.decoder = json.JSONDecoder()

    def more(self):
        if self.eof:
            return False
        chunk = self.stream.read(self.chunk_size)
        self.eof = not chunk
        if isinstance(chunk, bytes):
            chunk = self.utf8.decode(chunk, final=self.eof)
        self.text = self.text[self.position:] + chunk
        self.position = 0
        return not self.eof

    def peek(self):
        while True:
            while self.position < len(self.text) and self.text[self.position] in ' \t\r\n':
                self.position += 1
            if self.position < len(self.text):
                return self.text[self.position]
            if not self.more():
                return ''

    def take(self, char):
        if self.peek() != char:
            raise ValueError(f'Expected {char!r} in benchmark JSON')
        self.position += 1

    def more_value(self):
        if len(self.text) - self.position >= self.max_value_chars:
            raise ValueError('Benchmark JSON value exceeds max_value_chars')
        return self.more()

    def value(self, following):
        self.peek()
        while True:
            try:
                value, end = self.decoder.raw_decode(self.text, self.position)
            except json.JSONDecodeError:
                if self.eof:
                    raise
                self.more_value()
                continue
            if end - self.position > self.max_value_chars:
                raise ValueError('Benchmark JSON value exceeds max_value_chars')
            # A complete string/container/literal cannot grow when another
            # chunk arrives. Whitespace also terminates a numeric token. Drop
            # that prefix before looking ahead, so legal trailing whitespace
            # cannot accumulate as part of the value window.
            numeric = type(value) in (int, float) and self.text[self.position] in '-0123456789'
            if not numeric or (end < len(self.text) and self.text[end] in ' \t\r\n'):
                self.position = end
                delimiter = self.peek()
                if delimiter and delimiter in following:
                    return value
                raise ValueError('Invalid delimiter in benchmark JSON')
            tail = end
            while tail < len(self.text) and self.text[tail] in ' \t\r\n':
                tail += 1
            if tail < len(self.text) and self.text[tail] in following:
                self.position = end
                return value
            if self.eof:
                raise ValueError('Invalid delimiter in benchmark JSON')
            self.more_value()

    def cases(self):
        self.take('[')
        result = []
        if self.peek() != ']':
            while True:
                result.append(self.value(',]'))
                if self.peek() == ']':
                    break
                self.take(',')
        self.take(']')
        return result


def load_request(stream, *, chunk_size=262144, max_value_chars=32 * 1024 * 1024):
    for name, value in (('chunk_size', chunk_size), ('max_value_chars', max_value_chars)):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(f'{name} must be an integer')
        if value < 1:
            raise ValueError(f'{name} must be positive')
    reader = _Reader(stream, min(chunk_size, max_value_chars), max_value_chars)
    reader.take('{')
    result = {}
    if reader.peek() != '}':
        while True:
            key = reader.value(':')
            if not isinstance(key, str):
                raise ValueError('JSON object keys must be strings')
            reader.take(':')
            result[key] = reader.cases() if key == 'cases' else reader.value(',}')
            if reader.peek() == '}':
                break
            reader.take(',')
    reader.take('}')
    if reader.peek():
        raise ValueError('Trailing data after benchmark JSON')
    return result
