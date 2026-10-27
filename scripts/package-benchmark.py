#!/usr/bin/env python3
"""Archive measured evidence, excluding reconstructible duplicate input payloads."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

folder = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
files = [folder / name for name in ("manifest.json", "raw.json", "summary.json", "report.html")]
files += [folder / name for name in ("rust-compatibility.json", "matched-subset.json") if (folder / name).is_file()]
files += sorted((folder / "jobs").iterdir())
for path in files:
    if not path.is_file():
        raise ValueError(f"Missing evidence file: {path}")
manifest = {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, str(path.relative_to(folder)))
    archive.writestr("SHA256.json", json.dumps(manifest, indent=2) + "\n")
    archive.writestr("README.txt", "Measured evidence: raw samples, worker/CLI stdout, stderr, exact process commands, input manifest and source/build hashes.\nInput payload JSON files are excluded: rebuild from the original repository fixtures with scripts/benchmark-all.mjs and the recorded seed/config. The repository source is required to reproduce the binaries; git HEAD alone is insufficient when the recorded workspace contains uncommitted changes.\nSummarize offline: node scripts/summarize-benchmark.mjs raw.json summary.json\n")
print(f"Archived {len(files)} measured files: {output} ({output.stat().st_size} bytes)")
print("SHA256:", hashlib.sha256(output.read_bytes()).hexdigest())
