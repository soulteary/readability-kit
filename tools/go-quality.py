#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Generate complete GoReportCard evidence, or reject new findings against it."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / '.github' / 'reports' / 'go'
CHECKS = {'gofmt', 'go_vet', 'ineffassign', 'gocyclo', 'license', 'misspell'}


def validate(report):
    checks = report.get('checks', [])
    if len(checks) != len(CHECKS) or {c.get('name') for c in checks} != CHECKS:
        raise ValueError('The complete six-check GoReportCard result is required')
    if report.get('did_error') is not False or any(c.get('error') for c in checks):
        raise ValueError('A checker failed; refusing incomplete quality evidence')
    if not isinstance(report.get('files'), int) or report['files'] <= 0:
        raise ValueError('GoReportCard did not check any files')
    for value in [report.get('average')] + [c.get('percentage') for c in checks]:
        if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError('Invalid quality score')
    return report


def findings(report):
    # Line numbers move during refactoring; checker, file and diagnostic identify
    # the finding. No source files, checks or diagnostics are suppressed.
    return {(c['name'], f['filename'], e['error_string'].strip())
            for c in report['checks'] for f in c.get('file_summaries') or []
            for e in f.get('errors') or []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail on new findings without modifying committed reports')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        result = subprocess.run(['goreportcard-cli', '-d', 'go', '-j',
                                 '-svg', str(temporary / 'goreportcard.svg'),
                                 '-report', str(temporary / 'goreportcard-report.md')],
                                cwd=ROOT, check=True, text=True, capture_output=True)
        report = validate(json.loads(result.stdout.splitlines()[-1]))
        if args.check:
            baseline = validate(json.loads((REPORTS / 'goreportcard-report.json').read_text()))
            added = findings(report) - findings(baseline)
            evidence = ROOT / 'go-reports' / 'quality'
            evidence.mkdir(parents=True, exist_ok=True)
            (evidence / 'goreportcard-report.json').write_text(json.dumps(report, indent=2) + '\n')
            if added:
                raise SystemExit('New Go quality findings:\n' + '\n'.join(': '.join(item) for item in sorted(added)))
        else:
            REPORTS.mkdir(parents=True, exist_ok=True)
            for name in ('goreportcard.svg', 'goreportcard-report.md'):
                (REPORTS / name).write_bytes((temporary / name).read_bytes())
            report['checks'].sort(key=lambda check: check['name'])
            (REPORTS / 'goreportcard-report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f"Go quality: {report['average'] * 100:.1f}%, {report['files']} files, "
              f"{report['issues']} affected files; six checkers completed without errors")


if __name__ == '__main__':
    main()
