# SPDX-License-Identifier: Apache-2.0
"""The quality gate must reject incomplete runs and additional diagnostics."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('go_quality', Path(__file__).resolve().parents[1] / 'tools' / 'go-quality.py')
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)


def report():
    return {'files': 1, 'average': 1.0, 'did_error': False,
            'checks': [{'name': name, 'percentage': 1.0, 'error': '', 'file_summaries': []}
                       for name in sorted(quality.CHECKS)]}


def diagnostic(result, line=1, message='example diagnostic'):
    result['checks'][0]['file_summaries'].append({
        'filename': 'go/example.go',
        'errors': [{'line_number': line, 'error_string': message}],
    })


class QualityGateTests(unittest.TestCase):
    def test_requires_every_checker_exactly_once(self):
        for change in ('missing', 'duplicate'):
            result = report()
            if change == 'missing':
                result['checks'].pop()
            else:
                result['checks'][-1] = deepcopy(result['checks'][0])
            with self.subTest(change=change), self.assertRaises(ValueError):
                quality.validate(result)

    def test_rejects_failed_checkers_and_empty_runs(self):
        for change in ('aggregate_error', 'checker_error', 'empty'):
            result = report()
            if change == 'aggregate_error':
                result['did_error'] = True
            elif change == 'checker_error':
                result['checks'][0]['error'] = 'tool was unavailable'
            else:
                result['files'] = 0
            with self.subTest(change=change), self.assertRaises(ValueError):
                quality.validate(result)

    def test_line_moves_are_not_new_findings(self):
        baseline, candidate = report(), report()
        diagnostic(baseline, line=10)
        diagnostic(candidate, line=100)
        self.assertFalse(quality.findings(candidate) - quality.findings(baseline))

    def test_new_or_repeated_diagnostics_are_new_findings(self):
        baseline = report()
        diagnostic(baseline)
        for message in ('different diagnostic', 'example diagnostic'):
            candidate = deepcopy(baseline)
            diagnostic(candidate, line=2, message=message)
            added = quality.findings(candidate) - quality.findings(baseline)
            with self.subTest(message=message):
                self.assertEqual(sum(added.values()), 1)


if __name__ == '__main__':
    unittest.main()
