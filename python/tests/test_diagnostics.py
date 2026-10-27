import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[2] / 'tools'


@unittest.skipUnless((TOOLS / 'summarize-python-profile.py').exists(), 'repository diagnostic tools')
class DiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(TOOLS))
        try:
            spec = importlib.util.spec_from_file_location('paired', TOOLS / 'benchmark-python-paired.py')
            cls.paired = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.paired)
            spec = importlib.util.spec_from_file_location('summary', TOOLS / 'summarize-python-profile.py')
            cls.summary = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.summary)
        finally:
            sys.path.pop(0)

    def test_paired_worker_rejects_missing_cases_and_incomplete_samples(self):
        case = dict(id='one', durationsNs=[10, 11], lengths=[1, 1],
                    checksums=['0000000000000000']*2, outputBytes=[4, 4], statuses=['ok', 'ok'])
        valid = {'cases': [case]}
        self.paired.validate_worker(valid, ['one'], 2)
        for invalid in ({'cases': []}, {'cases': [case, case]},
                        {'cases': [{**case, 'durationsNs': [10]}]},
                        {'cases': [{**case, 'durationsNs': [float('nan'), 1]}]}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.paired.validate_worker(invalid, ['one'], 2)

    def test_profile_checks_remain_active_under_python_optimization(self):
        row = {name: 0 for name in self.summary.PHASES}
        row.update(nativeExtractNs=1, totalNs=1)
        raw = {'replicates': 1, 'nativeSha256': '0'*64, 'corpusCaseIds': ['a', 'b'],
               'detailedCaseIds': ['a'], 'jobs': []}
        for engine in ('chromium', 'mozilla'):
            for scope in ('full', 'detail'):
                raw['jobs'].append({'engine': engine, 'scope': scope, 'replicate': 0,
                                    'cases': [{'id': name, 'samples': [dict(row) for _ in range(3 if scope == 'full' else 10)]}
                                              for name in (['a', 'b'] if scope == 'full' else ['a'])]})
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory)/'raw.json', Path(directory)/'summary.json'
            def run(value):
                source.write_text(json.dumps(value))
                return subprocess.run([sys.executable, '-O', str(TOOLS/'summarize-python-profile.py'),
                                       str(source), str(output)], capture_output=True)
            self.assertEqual(run(raw).returncode, 0)
            invalid = copy.deepcopy(raw)
            invalid['jobs'][0]['cases'].pop()
            self.assertNotEqual(run(invalid).returncode, 0)
            invalid = copy.deepcopy(raw)
            invalid['jobs'][0]['replicate'] = 1
            self.assertNotEqual(run(invalid).returncode, 0)
            invalid = copy.deepcopy(raw)
            invalid['jobs'][0]['cases'][0]['samples'][0]['totalNs'] = 2
            self.assertNotEqual(run(invalid).returncode, 0)
