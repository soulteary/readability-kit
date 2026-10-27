import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_api import HTML, URL


class CliTests(unittest.TestCase):
    def run_cli(self, *args, html=HTML):
        return subprocess.run([sys.executable, '-m', 'readability_kit', *args],
                              input=html.encode('utf-8'), capture_output=True)

    def test_stdin_formats(self):
        for engine in ('chromium', 'mozilla'):
            result = self.run_cli('-', '--url', URL, '--engine', engine)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['engine'], engine)
        for fmt in ('text', 'html'):
            result = self.run_cli('-', '--url', URL, '--format', fmt)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('中文😀', result.stdout.decode())

    def test_exit_codes(self):
        self.assertEqual(self.run_cli('--help').returncode, 0)
        self.assertEqual(self.run_cli('--version').returncode, 0)
        self.assertEqual(self.run_cli('-', '--url', URL, html='').returncode, 2)
        for args in ([], ['-', '--url', 'file:///tmp/a'], ['-', '--url', URL, '--format', 'bad']):
            self.assertEqual(self.run_cli(*args).returncode, 1)

    def test_output_is_preserved_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'article.json'
            output.write_text('original')
            for html, url in (('', URL), (HTML, 'bad')):
                result = self.run_cli('-', '--url', url, '--output', str(output), html=html)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output.read_text(), 'original')
            source = Path(directory) / 'input.html'
            source.write_text(HTML, encoding='utf-8')
            result = self.run_cli(str(source), '--url', URL, '--output', str(output))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text())['url'], URL)
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['article.json', 'input.html'])
            self.assertEqual(self.run_cli('-', '--url', URL, '--output', str(output / 'bad')).returncode, 1)


if __name__ == '__main__':
    unittest.main()
