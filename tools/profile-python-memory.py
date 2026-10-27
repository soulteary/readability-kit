#!/usr/bin/env python3
"""Input-only RSS diagnostics; never subtract independent process high-water marks."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

# Match imports performed by the resident Python worker.
from readability_kit import extract_html  # noqa: F401

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--import-only', action='store_true')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.worker:
        request = {'cases': []} if args.import_only else json.load(sys.stdin)
        print(json.dumps({'pages': len(request['cases']),
                          'retainedHTMLStringBytes': sum(sys.getsizeof(c['html']) for c in request['cases']),
                          'htmlUTF8Bytes': sum(len(c['html'].encode('utf-8')) for c in request['cases'])}))
        return
    if args.input is None or args.output is None:
        parser.error('--input and --output required')
    spec = importlib.util.spec_from_file_location('measure_process', ROOT / 'tools/benchmark-process.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    request = json.loads(args.input.read_text())
    ordered = sorted(request['cases'], key=lambda c: (len(c['html'].encode('utf-8')), c['id']))
    cases = [ordered[int((len(ordered)-1)*q)] for q in (.1, .5, .9)]
    scopes = [('import-only', None), ('full-input', request), ('full-input-streamed', request)] + [(c['id'], {**request, 'cases': [c]}) for c in cases]
    jobs = []
    with tempfile.TemporaryDirectory(prefix='python-memory-') as directory:
        directory = Path(directory)
        for scope, payload in scopes:
            wire = json.dumps(payload, ensure_ascii=False) if payload is not None else ''
            path = directory / 'input.json'
            path.write_text(wire)
            for replicate in range(4):
                child = """import json, sys
from time import perf_counter_ns
from readability_kit import extract_html
request = {'cases': []} if sys.argv[1] == 'empty' else json.load(sys.stdin)
print(json.dumps({'pages': len(request['cases']),
 'retainedHTMLStringBytes': sum(sys.getsizeof(c['html']) for c in request['cases']),
 'htmlUTF8Bytes': sum(len(c['html'].encode('utf-8')) for c in request['cases'])}))
"""
                if scope == 'full-input-streamed':
                    child = child.replace("from readability_kit import extract_html", "from readability_kit import extract_html\nfrom python_benchmark_input import load_request")
                    child = child.replace('json.load(sys.stdin)', 'load_request(sys.stdin.buffer)')
                    child = 'import sys; sys.path.insert(0, ' + repr(str(ROOT / 'tools')) + ')\n' + child
                command = [sys.executable, '-c', child, 'empty' if payload is None else 'load']
                job = {'command': command, 'cwd': str(ROOT), 'inputFile': str(path),
                       'stdoutFile': str(directory / 'stdout'), 'stderrFile': str(directory / 'stderr'),
                       'timeoutSeconds': 60}
                stats = module.measure(job)
                if stats['exitCode'] or stats['timedOut']:
                    raise RuntimeError((directory / 'stderr').read_text())
                jobs.append({'scope': scope, 'replicate': replicate, 'stats': stats,
                             'wireUTF8Bytes': len(wire.encode('utf-8')), 'wirePythonStringBytes': sys.getsizeof(wire),
                             'retained': json.loads((directory / 'stdout').read_text())})
    args.output.write_text(json.dumps({'schema': 1, 'jobs': jobs}, indent=2)+'\n')


if __name__ == '__main__':
    main()
