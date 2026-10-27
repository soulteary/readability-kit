#!/usr/bin/env python3
"""Reproduce the four-window input-only experiment (never extraction timing)."""
import argparse
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
code = '''import sys,time,json
sys.path.insert(0,sys.argv[1])
from python_benchmark_input import load_request
from readability_kit import extract_html
start=time.perf_counter_ns()
request=load_request(sys.stdin.buffer,chunk_size=int(sys.argv[2]))
print(json.dumps({'ns':time.perf_counter_ns()-start,'pages':len(request['cases'])}))
'''
rows = []
windows = [65536, 262144, 1048576, 4194304]
for replicate in range(4):
    for size in windows[replicate:] + windows[:replicate]:
        with args.input.open('rb') as source, tempfile.TemporaryFile() as output:
            process = subprocess.Popen([sys.executable, '-c', code, str(ROOT / 'tools'), str(size)],
                                       stdin=source, stdout=output)
            _, status, usage = os.wait4(process.pid, 0)
            process.returncode = os.waitstatus_to_exitcode(status)
            output.seek(0)
            result = json.load(output)
            if process.returncode or result['pages'] != 130:
                raise RuntimeError('Input-only probe failed')
            rows.append({'rep': replicate, 'chunkSize': size, 'ns': result['ns'],
                         'rss': usage.ru_maxrss * (1024 if sys.platform == 'linux' else 1)})
for size in windows:
    group = [row for row in rows if row['chunkSize'] == size]
    print(size, statistics.median(row['ns']/1e6 for row in group),
          statistics.median(row['rss']/1048576 for row in group))
args.output.write_text(json.dumps(rows, indent=2)+'\n')
