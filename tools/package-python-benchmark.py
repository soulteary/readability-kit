#!/usr/bin/env python3
"""Archive four-language samples, diagnostics and the exact measured source/build files."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
folder, output = map(lambda value: Path(value).resolve(), sys.argv[1:])
manifest = json.loads((folder / 'manifest.json').read_text())
files = {}
for name in ['manifest.json', 'raw.json', 'summary.json', 'report.html', 'profile-raw.json',
             'profile-summary.json', 'memory-profile.json', 'compatibility.json', 'report.png']:
    files[name] = (folder / name).read_bytes()
for language in ('python', 'go', 'rust'):
    for layer in ('extraction', 'readerable'):
        name = f'{language}-{layer}.json'
        files[name] = (folder / name).read_bytes()
for path in sorted((folder / 'jobs').iterdir()):
    files[path.relative_to(folder).as_posix()] = path.read_bytes()
for name, digest in manifest['artifacts'].items():
    value = (ROOT / name).read_bytes()
    if hashlib.sha256(value).hexdigest() != digest:
        raise RuntimeError(f'Measured source/build file changed during sampling: {name}')
    files['sources/' + name] = value
# Report authoring and memory probes were added after the timing manifest.
for name in ['tools/render-python-benchmark.mjs', 'tools/profile-python-memory.py',
             'tools/package-python-benchmark.py', 'tools/check-python-benchmark.mjs']:
    files['postprocessing/' + name] = (ROOT / name).read_bytes()
files['README.txt'] = b'''Measured files are under sources/ and verified against manifest.json.
Later report/memory tooling is under postprocessing/. No generated input payloads
are included: rebuild them from the versioned HTML corpus, seed and configuration.
The source snapshot contains native binaries for the measured host, not a portable
build environment. Install pinned JS dependencies, Python and Rust crates before
rebuilding. JSON comparison reports preserve their original provenance.
'''
checksums = {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, value in sorted(files.items()):
        archive.writestr(name, value)
    archive.writestr('SHA256.json', json.dumps(checksums, indent=2))
print(f'{output}: {output.stat().st_size} bytes; SHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}')
