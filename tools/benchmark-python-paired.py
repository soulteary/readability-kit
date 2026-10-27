#!/usr/bin/env python3
"""Interleaved old API/old loader, new API/old loader, new API/new loader controls."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import shutil
import statistics
import subprocess
import sys
import re
from python_package_utils import require

ROOT = Path(__file__).resolve().parent.parent


def validate_worker(result, expected_ids, iterations):
    cases = result['cases']
    require([case['id'] for case in cases] == expected_ids, 'Wrong paired worker cases/order')
    for case in cases:
        for key in ['durationsNs', 'lengths', 'checksums', 'outputBytes', 'statuses']:
            require(len(case[key]) == iterations, f'Wrong paired sample count: {key}')
        require(all(type(v) is int and v > 0 for v in case['durationsNs']), 'Invalid paired durations')
        require(all(type(v) is int and v >= 0 for key in ['lengths', 'outputBytes'] for v in case[key]),
                'Invalid paired lengths')
        require(all(isinstance(v, str) and re.fullmatch('[0-9a-f]{16}', v) for v in case['checksums']),
                'Invalid paired checksums')
        require(all(v in ('ok', 'empty') for v in case['statuses']), 'Invalid paired statuses')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before-python', type=Path, required=True)
    parser.add_argument('--before-worker', type=Path, required=True)
    parser.add_argument('--before-wheel', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reference-python', type=Path)
    parser.add_argument('--reference-worker', type=Path)
    parser.add_argument('--replicates', type=int, default=6)
    parser.add_argument('--cold-iterations', type=int, default=12)
    parser.add_argument('--with-cli', action='store_true')
    args = parser.parse_args()
    require(bool(args.reference_python) == bool(args.reference_worker), 'Both reference arguments are required')
    require(args.replicates > 0 and args.cold_iterations > 0, 'Positive sample counts required')
    out = args.output.resolve()
    (out / 'paired-jobs').mkdir(parents=True, exist_ok=True)
    (out / 'before').mkdir(exist_ok=True)
    shutil.copyfile(args.before_worker, out / 'before/worker.py')
    shutil.copyfile(args.before_wheel, out / 'before' / args.before_wheel.name)
    spec = importlib.util.spec_from_file_location('measure', ROOT / 'tools/benchmark-process.py')
    measure = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(measure)
    corpus = [{'id': p.parent.name, 'html': p.read_text(encoding='utf-8')} for p in (ROOT / 'vendor/mozilla/test/test-pages').glob('*/source.html')]
    corpus.sort(key=lambda c: (len(c['html'].encode()), c['id']))
    details = [corpus[int((len(corpus)-1)*q)] for q in (.1, .5, .9)]
    modes = ['before', 'optimized', 'after'] if args.reference_python else ['before', 'api-only', 'after']
    runtimes = {'before': args.before_python, 'after': Path(sys.executable),
                ('optimized' if args.reference_python else 'api-only'): args.reference_python or Path(sys.executable)}
    workers = {'before': args.before_worker, 'after': ROOT / 'tools/benchmark-python-worker.py',
               ('optimized' if args.reference_worker else 'api-only'): args.reference_worker or args.before_worker}
    native_hashes = {}
    for name, python in runtimes.items():
        native = subprocess.check_output([str(python), '-c', 'from readability_kit import _native; print(_native.__file__)'], text=True).strip()
        native_hashes[name] = hashlib.sha256(Path(native).read_bytes()).hexdigest()
    worker_hashes = {k: hashlib.sha256(Path(v).read_bytes()).hexdigest() for k,v in workers.items()}
    python_versions = {k: subprocess.check_output([str(v), '--version'], text=True).strip() for k,v in runtimes.items()}
    jobs = []
    for rep in range(args.replicates):
        for engine in ('chromium', 'mozilla'):
            for scope, items, iterations in [('full', corpus, 3), ('detail', details, 10)]:
                ordered = list(items)
                random.Random(20261027+rep).shuffle(ordered)
                request = {'cases': [{**c, 'options': {'url': 'https://example.com/test/page.html', 'engine': engine}} for c in ordered],
                           'warmup': 2, 'iterations': iterations, 'serialize': True, 'allowEmpty': True}
                inp = out / f'paired-input-{rep}-{engine}-{scope}.json'
                inp.write_text(json.dumps(request, ensure_ascii=False, separators=(',', ':')))
                for mode in modes[rep % 3:] + modes[:rep % 3]:
                    name = f'{rep}-{engine}-{scope}-{mode}'
                    prefix = out / 'paired-jobs' / name
                    python = runtimes[mode]
                    worker = workers[mode]
                    specification = {'command': [str(python), str(worker)], 'cwd': str(ROOT), 'inputFile': str(inp),
                                     'stdoutFile': str(prefix)+'.stdout', 'stderrFile': str(prefix)+'.stderr', 'timeoutSeconds': 600}
                    Path(str(prefix)+'.spec.json').write_text(json.dumps(specification))
                    stats = measure.measure(specification)
                    if stats['exitCode'] or stats['timedOut']:
                        raise RuntimeError(Path(specification['stderrFile']).read_text())
                    result = json.loads(Path(specification['stdoutFile']).read_text())
                    validate_worker(result, [c['id'] for c in ordered], iterations)
                    jobs.append({'replicate': rep, 'engine': engine, 'scope': scope, 'mode': mode, 'stats': stats, 'worker': result})
                print(f'Paired controls {rep+1}/{args.replicates} {engine}/{scope}', flush=True)
    cold_jobs = []
    if args.with_cli:
        articles = {}
        for rep in range(args.cold_iterations):
            for engine in ('chromium', 'mozilla'):
                for item in details:
                    for mode in modes[rep % 3:] + modes[:rep % 3]:
                        prefix = out / 'paired-jobs' / f'cold-{rep}-{engine}-{item["id"]}-{mode}'
                        command = [str(runtimes[mode]), '-m', 'readability_kit',
                                   str(ROOT / 'vendor/mozilla/test/test-pages' / item['id'] / 'source.html'),
                                   '--url', 'https://example.com/test/page.html', '--engine', engine, '--format', 'json']
                        specification = {'command': command, 'cwd': str(ROOT),
                            'stdoutFile': str(prefix)+'.stdout', 'stderrFile': str(prefix)+'.stderr', 'timeoutSeconds': 60}
                        Path(str(prefix)+'.spec.json').write_text(json.dumps(specification))
                        stats = measure.measure(specification)
                        require(stats['exitCode'] == 0 and not stats['timedOut'], 'CLI control failed')
                        article = json.loads(Path(specification['stdoutFile']).read_text())
                        key = (engine, item['id'])
                        require(key not in articles or articles[key] == article, 'CLI versions returned different Article fields')
                        articles[key] = article
                        cold_jobs.append({'phase': 'cold', 'replicate': rep, 'engine': engine, 'id': item['id'], 'mode': mode, 'stats': stats})
            for mode in modes[rep % 3:] + modes[:rep % 3]:
                prefix = out / 'paired-jobs' / f'startup-{rep}-{mode}'
                specification = {'command': [str(runtimes[mode]), '-m', 'readability_kit', '--version'], 'cwd': str(ROOT),
                    'stdoutFile': str(prefix)+'.stdout', 'stderrFile': str(prefix)+'.stderr', 'timeoutSeconds': 60}
                Path(str(prefix)+'.spec.json').write_text(json.dumps(specification))
                stats = measure.measure(specification)
                require(stats['exitCode'] == 0 and not stats['timedOut'], 'Startup control failed')
                cold_jobs.append({'phase': 'startup', 'replicate': rep, 'mode': mode, 'stats': stats,
                                  'version': Path(specification['stdoutFile']).read_text().strip()})
            print(f'CLI controls {rep+1}/{args.cold_iterations}', flush=True)
    raw = {'schema': 1, 'seed': 20261027, 'replicates': args.replicates, 'nativeHashes': native_hashes,
           'jobs': jobs, 'coldJobs': cold_jobs, 'workerHashes': worker_hashes, 'pythonVersions': python_versions}

    (out / 'paired-raw.json').write_text(json.dumps(raw))
    summary = {'schema': 1, 'replicates': args.replicates, 'modes': modes, 'nativeHashes': native_hashes, 'engines': {}}
    for engine in ('chromium', 'mozilla'):
        summary['engines'][engine] = {}
        for scope in ('full', 'detail'):
            values = {}
            signatures = {}
            for mode in modes:
                group = [j for j in jobs if (j['engine'], j['scope'], j['mode']) == (engine, scope, mode)]
                require(len(group) == args.replicates, 'Wrong paired job count')
                samples = {}
                for job in group:
                    for case in job['worker']['cases']:
                        samples.setdefault(case['id'], []).extend(case['durationsNs'])
                        signature = (case['lengths'][0], case['checksums'][0], case['statuses'][0])
                        require(all(v == signature[0] for v in case['lengths']), 'Unstable length')
                        require(all(v == signature[1] for v in case['checksums']), 'Unstable checksum')
                        require(all(v == signature[2] for v in case['statuses']), 'Unstable status')
                        require(case['id'] not in signatures or signatures[case['id']] == signature,
                                'Paired implementations returned different results')
                        signatures[case['id']] = signature
                # Same nearest-rank median as the four-language summarizer.
                medians = {name: sorted(v)[(len(v)-1)//2]/1e6 for name, v in samples.items()}
                values[mode] = {'sumPageMediansMs': sum(medians.values()), 'perPageMs': medians,
                                'rssMiB': statistics.median(j['stats']['maxRSSBytes']/1048576 for j in group),
                                'workerWallMs': statistics.median(j['stats']['wallNs']/1e6 for j in group)}
            summary['engines'][engine][scope] = values
    def statistics_for(values):
        values = sorted(values)
        return {'n': len(values), 'p50': values[(len(values)-1)//2], 'min': values[0], 'max': values[-1]}
    if args.with_cli:
        summary['coldIterations'] = args.cold_iterations
        summary['cold'] = {}
        summary['startup'] = {}
        for mode in modes:
            startup = [j for j in cold_jobs if j['phase'] == 'startup' and j['mode'] == mode]
            summary['startup'][mode] = {'wallMs': statistics_for([j['stats']['wallNs']/1e6 for j in startup]),
                                        'rssMiB': statistics_for([j['stats']['maxRSSBytes']/1048576 for j in startup])}
            for engine in ('chromium','mozilla'):
                for item in details:
                    group = [j for j in cold_jobs if j['phase'] == 'cold' and j['mode'] == mode and j['engine'] == engine and j['id'] == item['id']]
                    summary['cold'].setdefault(engine, {}).setdefault(item['id'], {})[mode] = {
                        'wallMs': statistics_for([j['stats']['wallNs']/1e6 for j in group]),
                        'rssMiB': statistics_for([j['stats']['maxRSSBytes']/1048576 for j in group])}
    (out / 'paired-summary.json').write_text(json.dumps(summary, indent=2)+'\n')


if __name__ == '__main__':
    main()
