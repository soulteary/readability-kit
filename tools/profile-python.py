#!/usr/bin/env python3
"""Separate diagnostic measurements; never substitute them for the public API benchmark.

In worker mode, wrap only the native call inside the actual public Python facade.
All phase durations share perf_counter_ns/Instant monotonic clocks. Boundary
residual includes conversions, GIL/dispatch, timer overhead and the profiling
return tuple; it is an estimate, not a pure FFI instruction benchmark.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import subprocess
import sys
from time import perf_counter_ns
from python_package_utils import require

import readability_kit as api
from readability_kit import _native

ROOT = Path(__file__).resolve().parent.parent


def worker(request):
    original = _native.extract_article
    phase = {}

    def measured_native(html, options):
        entered = perf_counter_ns()
        phase['pythonPrepareNs'] = entered - phase['start']
        output, options_ns, extraction_ns, serialization_ns = _native.profile_extract_article(html, options)
        returned = perf_counter_ns()
        phase.update(nativeOptionsNs=options_ns, nativeExtractNs=extraction_ns,
                     nativeConvertNs=serialization_ns,
                     boundaryResidualNs=returned-entered-options_ns-extraction_ns-serialization_ns,
                     returned=returned)
        return output

    results = []
    try:
        for case in request['cases']:
            samples = []
            # Check the profiling entry against the unmodified public API.
            expected = api.extract_html(case['html'], **case['options'])
            _native.extract_article = measured_native
            for iteration in range(-request['warmup'], request['iterations']):
                phase.clear()
                phase['start'] = perf_counter_ns()
                article = api.extract_html(case['html'], **case['options'])
                decoded = perf_counter_ns()
                value = None if article is None else article.to_dict(camel_case=True)
                converted = perf_counter_ns()
                output = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
                ended = perf_counter_ns()
                if article != expected:
                    raise AssertionError('Diagnostic extraction changed the public result')
                if iteration >= 0:
                    row = {key: value for key, value in phase.items() if key.endswith('Ns')}
                    row.update(pythonDecodeArticleNs=decoded-phase['returned'],
                               toDictNs=converted-decoded, pythonJSONNs=ended-converted,
                               totalNs=ended-phase['start'], outputBytes=len(output.encode('utf-8')))
                    parts = [v for k, v in row.items() if k.endswith('Ns') and k != 'totalNs']
                    require(sum(parts) == row['totalNs'], 'Profile phases do not sum to total')
                    samples.append(row)
            _native.extract_article = original
            results.append({'id': case['id'], 'samples': samples})
    finally:
        _native.extract_article = original
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--replicates', type=int, default=4)
    args = parser.parse_args()
    if args.worker:
        json.dump(worker(json.load(sys.stdin)), sys.stdout)
        return
    if args.output is None or args.replicates < 1:
        parser.error('--output and positive --replicates required')
    sources = []
    for path in (ROOT / 'vendor/mozilla/test/test-pages').glob('*/source.html'):
        data = path.read_bytes()
        sources.append({'id': path.parent.name, 'bytes': len(data), 'html': data.decode('utf-8')})
    sources.sort(key=lambda case: (case['bytes'], case['id']))
    details = [sources[int((len(sources)-1)*q)] for q in (.1, .5, .9)]
    jobs = []
    for replicate in range(args.replicates):
        for engine in ('chromium', 'mozilla'):
            for scope, cases, iterations in (('full', sources, 3), ('detail', details, 10)):
                ordered = list(cases)
                random.Random(20261027+replicate).shuffle(ordered)
                request = {'warmup': 2, 'iterations': iterations, 'cases': [
                    {'id': c['id'], 'html': c['html'], 'options': {
                        'url': 'https://example.com/test/page.html', 'engine': engine}}
                    for c in ordered]}
                result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--worker'],
                                        input=json.dumps(request), text=True, capture_output=True,
                                        timeout=600, check=True)
                jobs.append({'replicate': replicate, 'engine': engine, 'scope': scope,
                             'cases': json.loads(result.stdout)})
                print(f'Profile {replicate+1}/{args.replicates} {engine}/{scope}', flush=True)
    report = {'schema': 1, 'python': sys.version, 'replicates': args.replicates,
              'nativeSha256': hashlib.sha256(Path(_native.__file__).read_bytes()).hexdigest(),
              'phases': 'Measured within instrumented calls; boundary residual includes instrumentation.',
              'corpusCaseIds': [c['id'] for c in sources],
              'detailedCaseIds': [c['id'] for c in details], 'jobs': jobs}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report), encoding='utf-8')


if __name__ == '__main__':
    main()
