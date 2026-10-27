"""Protocol decoder regressions: UTF-8 chunks, JSON token boundaries and errors."""
import importlib.util
import io
import json
from pathlib import Path
import unittest

TOOL = Path(__file__).resolve().parents[2] / 'tools/python_benchmark_input.py'


@unittest.skipUnless(TOOL.exists(), 'benchmark tools are repository-only')
class InputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('benchmark_input', TOOL)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_matches_stdlib_at_every_small_chunk_boundary(self):
        cases = [
            {'cases': [{'html': '中文😀\\"[]{}', 'options': {'url': 'https://example.com'}}],
             'iterations': 123, 'warmup': 2, 'serialize': True, 'allowEmpty': False},
            {'iterations': 1e20, 'warmup': 1.2e-8, 'cases': [], 'extra': None},
            {'cases': [{'html': 'x'*10000}], 'iterations': 1}, {},
        ]
        for case in cases:
            for ascii_mode in (False, True):
                payload = json.dumps(case, ensure_ascii=ascii_mode).encode()
                for size in (1, 2, 3, 7, 64, 65536, 262144):
                    with self.subTest(size=size, ascii_mode=ascii_mode):
                        self.assertEqual(self.module.load_request(io.BytesIO(payload), chunk_size=size), case)

    def test_text_stream_and_whitespace(self):
        self.assertEqual(self.module.load_request(io.StringIO(' { "cases": [] } \n'), chunk_size=1), {'cases': []})

    def test_large_or_malformed_values_have_a_read_budget(self):
        for prefix in (b'{"cases":[{"html":"', b'{"bad":garbage'):
            source = io.BytesIO(prefix + b'x' * 100000)
            with self.assertRaisesRegex(ValueError, 'max_value_chars'):
                self.module.load_request(source, chunk_size=8, max_value_chars=64)
            self.assertLess(source.tell(), 128)
        with self.assertRaises(ValueError):
            self.module.load_request(io.BytesIO(b'{}'), max_value_chars=0)
        with self.assertRaises(TypeError):
            self.module.load_request(io.BytesIO(b'{}'), chunk_size=True)

    def test_complete_value_cannot_overshoot_budget_in_last_chunk(self):
        payload = json.dumps({'extra': 'x' * 80, 'cases': []}).encode()
        with self.assertRaisesRegex(ValueError, 'max_value_chars'):
            self.module.load_request(io.BytesIO(payload), chunk_size=64, max_value_chars=64)

    def test_whitespace_is_not_retained_as_part_of_value_budget(self):
        for value in (1, 'value', True, None, {'key': 'value'}):
            payload = ('{"extra":' + json.dumps(value) + ' ' * 10000 + ',"cases":[]}').encode()
            self.assertEqual(self.module.load_request(io.BytesIO(payload), chunk_size=3, max_value_chars=64),
                             {'extra': value, 'cases': []})

    def test_rejects_malformed_or_trailing_input(self):
        for payload in (b'', b'[]', b'{"cases":[}', b'{"cases":[1,]}', b'{"iterations":1e}', b'{} trailing', b'{"cases":[]}{}', b'{"x":"\xff"}'):
            with self.subTest(payload=payload), self.assertRaises((ValueError, UnicodeError)):
                self.module.load_request(io.BytesIO(payload), chunk_size=2)
