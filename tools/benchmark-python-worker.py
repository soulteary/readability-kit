#!/usr/bin/env python3
"""Same resident protocol as the JS/Go/Rust workers; public Python API plus JSON."""
import json
import sys
from time import perf_counter_ns
from readability_kit import extract_html
from python_benchmark_input import load_request


def checksum(text):
    value = 0xcbf29ce484222325
    for byte in text.encode('utf-8'):
        value = ((value ^ byte) * 0x100000001b3) & 0xffffffffffffffff
    return f'{value:016x}'


def main():
    request = load_request(sys.stdin.buffer)
    if not request['cases'] or request['iterations'] < 1 or request['warmup'] < 0:
        raise ValueError('Invalid benchmark request')
    results = []
    for case in request['cases']:
        row = dict(id=case['id'], durationsNs=[], lengths=[], checksums=[], outputBytes=[], statuses=[])
        for iteration in range(-request['warmup'], request['iterations']):
            start = perf_counter_ns()
            article = extract_html(case['html'], **case['options'])
            encoded = (json.dumps(None if article is None else article.to_dict(camel_case=True),
                                  ensure_ascii=False, separators=(',', ':'))
                       if request.get('serialize', True) else '')
            elapsed = perf_counter_ns() - start
            if not request.get('allowEmpty') and (article is None or not article.text_content):
                raise ValueError(f'Empty article: {case["id"]}')
            if iteration >= 0:
                row['durationsNs'].append(elapsed)
                row['lengths'].append(0 if article is None else article.length)
                row['checksums'].append(checksum('' if article is None else article.text_content))
                row['outputBytes'].append(len(encoded.encode('utf-8')))
                row['statuses'].append('empty' if article is None else 'ok')
        results.append(row)
    json.dump({'cases': results}, sys.stdout)


if __name__ == '__main__':
    main()
