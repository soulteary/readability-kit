import concurrent.futures
import dataclasses
import json
import gc
import weakref
import threading
import sys
import importlib.metadata
import unittest

from readability_kit import Article, ExtractionError, extract_html, is_probably_readerable

URL = 'https://example.com/news/story'
HTML = '''<html lang="zh"><head><title>A useful article title</title>
<base href="/assets/"></head><body><article><h1>A useful article title</h1><p>''' + (
    '中文😀 This is a substantial article, with explanatory prose and useful information. ' * 20
) + '''</p><p><a href="../more">Read more</a><img src="photo.jpg" onerror="alert(1)"></p>
<script>alert(2)</script></article></body></html>'''


class ApiTests(unittest.TestCase):
    def test_both_engines_and_metadata(self):
        for engine in ('chromium', 'mozilla'):
            with self.subTest(engine=engine):
                article = extract_html(HTML, url=URL, engine=engine)
                self.assertIsInstance(article, Article)
                self.assertEqual(article.engine, engine)
                self.assertEqual(article.url, URL)
                self.assertIn('中文😀', article.text_content)
                self.assertEqual(article.length, len(article.text_content.encode('utf-16-le')) // 2)
                self.assertIn('https://example.com/assets/photo.jpg', article.content)
                self.assertIn('https://example.com/more', article.content)
                self.assertNotIn('onerror', article.content)
                self.assertNotIn('<script', article.content)
                self.assertTrue(is_probably_readerable(HTML, engine=engine))
                self.assertEqual(json.loads(json.dumps(article.to_dict())), article.to_dict())
                self.assertEqual(article.to_dict(camel_case=True)['textContent'], article.text_content)
                self.assertIn('publishedTime', article.to_dict(camel_case=True))
                with self.assertRaises(dataclasses.FrozenInstanceError):
                    article.title = 'changed'

    def test_diagnostic_binding_matches_public(self):
        from readability_kit import _native
        for engine in ('chromium', 'mozilla'):
            output, options_ns, extract_ns, serialize_ns = _native.profile_extract_json(
                HTML, json.dumps({'url': URL, 'engine': engine}))
            self.assertEqual(json.loads(output), extract_html(HTML, url=URL, engine=engine).to_dict(camel_case=True))
            self.assertTrue(all(value >= 0 for value in (options_ns, extract_ns, serialize_ns)))

    def test_direct_binding_matches_legacy_for_all_options(self):
        from readability_kit import _native
        for engine in ('chromium', 'mozilla'):
            options = dict(url=URL, engine=engine, charThreshold=1,
                           maxElemsToParse=0, nbTopCandidates=3, keepClasses=True,
                           classesToPreserve=['keep'], disableJSONLD=True,
                           linkDensityModifier=0.1, sanitize=False)
            fields = _native.extract_article(HTML, options)
            expected = json.loads(_native.extract_json(HTML, json.dumps(options)))
            self.assertEqual(Article(*fields).to_dict(camel_case=True), expected)
            profiled, *durations = _native.profile_extract_article(HTML, options)
            self.assertEqual(fields, profiled)
            self.assertTrue(all(value >= 0 for value in durations))

    def test_to_dict_preserves_mutable_and_subclass_behavior(self):
        article = extract_html(HTML, url=URL)
        manual = dataclasses.replace(article, title=['mutable'])
        copied = manual.to_dict()
        copied['title'].append('changed')
        self.assertEqual(manual.title, ['mutable'])
        @dataclasses.dataclass(frozen=True)
        class Extended(Article):
            extra: str = 'extension'
        extended = Extended(**dataclasses.asdict(article))
        self.assertEqual(extended.to_dict(), dataclasses.asdict(extended))
        self.assertEqual(extended.to_dict(camel_case=True)['extra'], 'extension')

    def test_initvar_subclass_dict_uses_actual_dataclass_fields(self):
        @dataclasses.dataclass(frozen=True)
        class Special(Article):
            title: dataclasses.InitVar[str]
        article = Special('ignored', 'body', 'body', 4, URL, 'chromium',
                          None, None, None, None, None, None)
        self.assertEqual(article.to_dict(), dataclasses.asdict(article))
        self.assertNotIn('title', article.to_dict(camel_case=True))

    def test_version_matches_distribution_and_extension(self):
        import readability_kit as package
        self.assertEqual(package.__version__, importlib.metadata.version('readability-kit'))
        self.assertEqual(package.__version__, package._native.__version__)

    def test_input_owners_are_released_after_success_empty_and_failure(self):
        class Text(str):
            pass
        def invoke(index):
            text = Text(HTML if index % 3 else '')
            reference = weakref.ref(text)
            try:
                extract_html(text, url=URL, max_elems_to_parse=1 if index % 3 == 2 else 0)
            except ExtractionError:
                pass
            return reference
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            references = list(pool.map(invoke, range(60)))
        gc.collect()
        self.assertTrue(all(reference() is None for reference in references))

    def test_native_calls_release_the_gil(self):
        # Disable periodic bytecode switching: the observer gets to run only
        # when the extraction/readerability call detaches from Python.
        html = '<article><p>' + 'Readable text, with detail. ' * 60000 + '</p></article>'
        for operation in (lambda: extract_html(html, url=URL),
                          lambda: is_probably_readerable(html)):
            ready, start, progressed = threading.Event(), threading.Event(), threading.Event()
            def observer():
                ready.set()
                start.wait()
                progressed.set()
            thread = threading.Thread(target=observer)
            thread.start()
            ready.wait(5)
            old_interval = sys.getswitchinterval()
            try:
                sys.setswitchinterval(1000)
                start.set()
                operation()
                self.assertTrue(progressed.is_set(), 'native call held the GIL throughout')
            finally:
                sys.setswitchinterval(old_interval)
                start.set()
                thread.join(5)
            self.assertFalse(thread.is_alive())

    def test_empty(self):
        self.assertIsNone(extract_html('', url=URL))
        self.assertFalse(is_probably_readerable('<p>short</p>'))

    def test_invalid_types(self):
        for options in ({'char_threshold': True}, {'char_threshold': 1.0},
                        {'max_elems_to_parse': None}, {'keep_classes': 1},
                        {'sanitize': None}, {'classes_to_preserve': 'abc'},
                        {'classes_to_preserve': [1]}, {'link_density_modifier': True},
                        {'engine': None}, {'unknown': True}):
            with self.subTest(options=options), self.assertRaises(TypeError):
                extract_html(HTML, url=URL, **options)
        with self.assertRaises(TypeError):
            extract_html(b'html', url=URL)
        with self.assertRaises(TypeError):
            is_probably_readerable(HTML, min_score=False)

    def test_invalid_values(self):
        for options in ({'char_threshold': 0}, {'nb_top_candidates': 0},
                        {'max_elems_to_parse': -1}, {'char_threshold': 2**100},
                        {'link_density_modifier': float('nan')},
                        {'link_density_modifier': float('inf')},
                        {'link_density_modifier': 10**1000}, {'link_density_modifier': 1e300},
                        {'engine': 'other'}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                extract_html(HTML, url=URL, **options)
        for url in ('relative', 'file:///tmp/test', 'https://'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                extract_html(HTML, url=url)
        with self.assertRaises(ValueError):
            extract_html('\ud800', url=URL)
        for score in (-1, float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                is_probably_readerable(HTML, min_score=score)

    def test_limits_and_classes(self):
        with self.assertRaises(ExtractionError):
            extract_html(HTML, url=URL, max_elems_to_parse=1)
        html = HTML.replace('<p>', '<p class="keep drop">')
        article = extract_html(html, url=URL, classes_to_preserve=['keep'])
        self.assertIn('class="keep"', article.content)
        self.assertNotIn('class="keep drop"', article.content)
        # Disabling sanitization still applies semantic cleanup.
        unsafe = extract_html(HTML, url=URL, sanitize=False)
        self.assertIn('onerror', unsafe.content)

    def test_concurrent_independent_calls(self):
        expected = extract_html(HTML, url=URL)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: extract_html(HTML, url=URL), range(24)))
        self.assertTrue(all(result == expected for result in results))


if __name__ == '__main__':
    unittest.main()
