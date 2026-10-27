#!/usr/bin/env python3
"""Archive measured optimization data and unchanged source/build fingerprints."""
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
             'report.html', 'report.png']:
    files[name] = (folder / name).read_bytes()
for language in ['python', 'go', 'rust']:
    for layer in ['extraction', 'readerable']:
        name = f'{language}-{layer}.json'
        files[name] = (folder / name).read_bytes()
for directory in ['jobs', 'paired-jobs', 'before']:
    for path in sorted((folder / directory).iterdir()):
        files[path.relative_to(folder).as_posix()] = path.read_bytes()
for name, digest in manifest['artifacts'].items():
    data = (ROOT / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError(f'Measured artifact changed: {name}')
    files['sources/' + name] = data
for name in ['render-python-optimization.mjs', 'package-python-optimization.py']:
    files['postprocessing/tools/' + name] = (ROOT / 'tools' / name).read_bytes()
files['README.txt'] = b'''Four-language samples and three-mode interleaved Python controls.
All measured files match manifest.json. Source/build snapshots are under sources/.
The old Python wheel and worker are under before/. Recreate its venv locally;
absolute machine-specific executable paths are provenance, not portable commands.
Input JSON files are reconstructible from the corpus, seed and measurement code.
Report adapters created after sampling are under postprocessing/.
'''
checksums = {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(name, data)
    archive.writestr('SHA256.json', json.dumps(checksums, indent=2))
print(f'{output}: {output.stat().st_size} bytes; sha256={hashlib.sha256(output.read_bytes()).hexdigest()}')
