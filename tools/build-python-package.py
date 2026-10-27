#!/usr/bin/env python3
"""Build local Python release artifacts, preserving locked dependency versions.

Maturin trims unrelated Cargo workspace members in the sdist but retains the
workspace lockfile. Prune that lockfile offline and verify it only removes
packages, so the standalone sdist can also build with --locked.
"""
import argparse
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

from python_package_utils import extract_source, require

ROOT = Path(__file__).resolve().parent.parent


def run(*args, cwd=ROOT):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'python/dist')
    args = parser.parse_args()
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=True)
    run(sys.executable, ROOT / 'tools/prepare-python-package.py')
    run(sys.executable, '-m', 'maturin', 'sdist', '--out', output, cwd=ROOT / 'python')
    sources = list(output.glob('readability_kit-*.tar.gz'))
    if len(sources) != 1:
        raise SystemExit('Use an output directory containing only this version of the sdist')
    source = sources[0]
    with tempfile.TemporaryDirectory(prefix='readability-sdist-') as temporary:
        with tarfile.open(source) as archive:
            members = archive.getmembers()
            root = extract_source(archive, temporary)
        lock = root / 'Cargo.lock'
        before = {block.strip() for block in lock.read_text().split('[[package]]')[1:]}
        subprocess.run(['cargo', 'metadata', '--offline', '--format-version', '1'],
                       cwd=root, check=True, stdout=subprocess.DEVNULL)
        after = {block.strip() for block in lock.read_text().split('[[package]]')[1:]}
        require(bool(after) and after.issubset(before),
                'sdist resolution changed a locked package instead of only pruning')
        replacement = lock.read_bytes()
        temporary_archive = output / (source.name + '.tmp')
        try:
            with tarfile.open(source) as archive, tarfile.open(temporary_archive, 'w:gz') as patched:
                for member in members:
                    data = replacement if member.name == f'{root.name}/Cargo.lock' else None
                    if data is not None:
                        member.size = len(data)
                        patched.addfile(member, io.BytesIO(data))
                    else:
                        patched.addfile(member, archive.extractfile(member) if member.isfile() else None)
            os.replace(temporary_archive, source)
        finally:
            temporary_archive.unlink(missing_ok=True)
    run(sys.executable, '-m', 'maturin', 'build', '--release', '--locked', '--out', output,
        cwd=ROOT / 'python')


if __name__ == '__main__':
    main()
