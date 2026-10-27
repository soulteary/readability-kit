#!/usr/bin/env python3
"""Archive post-review measurements with exact current and recovered sources."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
folder, output = map(lambda value: Path(value).resolve(), sys.argv[1:])
manifest = json.loads((folder / 'manifest.json').read_text())
files = {}
for name in ['manifest.json', 'raw.json', 'summary.json', 'profile-raw.json', 'profile-summary.json',
             'paired-raw.json', 'paired-summary.json', 'memory-profile.json', 'compatibility.json',
             'regression.json', 'memory-control.json', 'report.html', 'report.png']:
    files[name] = (folder / name).read_bytes()
for language in ['python', 'go', 'rust']:
    for layer in ['extraction', 'readerable']:
        name = f'{language}-{layer}.json'
        files[name] = (folder / name).read_bytes()
for directory in ['jobs', 'paired-jobs', 'memory-control-jobs', 'before', 'optimized-reference']:
    for path in sorted((folder / directory).rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            files[path.relative_to(folder).as_posix()] = path.read_bytes()
reference = json.loads((folder / 'optimized-reference/reference.json').read_text())
for name, digest in reference['files'].items():
    if hashlib.sha256(files['optimized-reference/' + name]).hexdigest() != digest:
        raise RuntimeError(f'Recovered reference changed: {name}')
for name, digest in manifest['artifacts'].items():
    data = (ROOT / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError(f'Measured source/build file changed: {name}')
    files['sources/' + name] = data
for name in ['package-python-reviewed.py', 'benchmark-python-memory-control.py',
             'augment-python-reviewed.mjs', 'check-python-reviewed.mjs']:
    files['postprocessing/tools/' + name] = (ROOT / 'tools' / name).read_bytes()
files['README.txt'] = b'''Post-review four-language measurements and interleaved three-version controls.
Current measured files are stored under sources/ and match manifest.json.
The unoptimized wheel is under before/. The exact optimized/pre-review runtime,
worker and input loader were recovered from an archived source/binary snapshot;
they are under optimized-reference/ with per-file hashes and archive provenance.
Recreate an isolated Python environment with that package directory on sys.path.
Input payloads can be reconstructed from the locked corpus and sampling code.
Absolute executable paths in process specs record this host; they are not portable.
'''
checksums = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(name, data)
    archive.writestr('SHA256.json', json.dumps(checksums, indent=2))
print(f'{output}: {output.stat().st_size} bytes; sha256={hashlib.sha256(output.read_bytes()).hexdigest()}')
