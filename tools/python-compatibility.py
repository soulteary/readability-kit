#!/usr/bin/env python3
"""Capture Python candidate results using a 30-second subprocess limit per case.

Use the existing tools/compatibility.mjs compare command for strict validation.
Python's subprocess transport avoids intermittent macOS Node spawnSync stalls.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from readability_kit import _native

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text(encoding='utf-8'))
    adapter = ROOT / 'python/tests/compat_adapter.py'
    candidate = {
        'schema': 1,
        'provenance': {
            'python': sys.version,
            'executable': sys.executable,
            'nativeSha256': hashlib.sha256(Path(_native.__file__).read_bytes()).hexdigest(),
            'adapterSha256': hashlib.sha256(adapter.read_bytes()).hexdigest(),
            'baselineSha256': hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
        },
        'cases': [],
    }
    for index, case in enumerate(baseline['cases'], 1):
        request = {key: case[key] for key in ('html', 'options', 'layer')}
        try:
            child = subprocess.run(
                [sys.executable, str(adapter)],
                input=json.dumps(request, ensure_ascii=False),
                encoding='utf-8', capture_output=True, timeout=30,
            )
            if child.returncode:
                raise RuntimeError(f'candidate exited {child.returncode}: {child.stderr}')
            result = json.loads(child.stdout)
        except (subprocess.TimeoutExpired, OSError, ValueError, RuntimeError) as error:
            result = {'status': 'error', 'article': None, 'error': str(error), 'transportError': True}
        candidate['cases'].append({**case, 'result': result})
        if index % 100 == 0:
            print(f'Captured {index}/{len(baseline["cases"])} Python cases', flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(candidate, ensure_ascii=False), encoding='utf-8')
    print(f'Candidate saved to {args.output}; run the strict comparator to validate it.')


if __name__ == '__main__':
    main()
