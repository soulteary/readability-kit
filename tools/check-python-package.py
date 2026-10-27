#!/usr/bin/env python3
"""Verify an installed wheel in isolation and rebuild a wheel from its sdist.

Invoke with the build environment's Python after `maturin build --release --sdist`.
No upload/publish operation is performed.
"""
import argparse
import hashlib
import json
from email.parser import BytesParser
from pathlib import PurePosixPath
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import venv
import zipfile

from python_package_utils import extract_source, require

ROOT = Path(__file__).resolve().parent.parent


def run(*args, cwd=None):
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def validate_wheel(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate wheel entries')
        require(not any('__pycache__' in name or name.endswith('.pyc') for name in names),
                'Bytecode cache in wheel')
        prefix = 'readability_kit/_licenses/'
        expected = set()
        for line in archive.read(prefix + 'SHA256SUMS').decode().splitlines():
            digest, name = line.split('  ', 1)
            path = PurePosixPath(name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in name,
                    f'Unsafe license path: {name}')
            require(prefix + name not in expected, f'Duplicate license entry: {name}')
            expected.add(prefix + name)
            require(hashlib.sha256(archive.read(prefix + name)).hexdigest() == digest,
                    f'License checksum mismatch: {name}')
        actual = {name for name in names if name.startswith(prefix) and not name.endswith('/')
                  and name != prefix + 'SHA256SUMS'}
        require(expected == actual, 'Unlisted or missing license/source files')
        metadata = json.loads(archive.read(prefix + 'DEPENDENCIES.json'))
        require(any(p['name'] == 'pyo3' for p in metadata['packages']), 'Missing PyO3 notices')
        require(archive.read(prefix + 'TARGET').decode().strip() == metadata['target'],
                'Dependency target metadata mismatch')
        for suffix in ('py.typed', '_licenses/NOTICE', '_licenses/DEPENDENCIES.json',
                       '_licenses/Cargo.lock', '_licenses/TARGET'):
            require(any(name.endswith(suffix) for name in names), f'Missing {suffix}')
        require(any('/_licenses/source/' in name and name.endswith('.rs') for name in names),
                'Missing corresponding MPL source')
        native = [name for name in names if name.startswith('readability_kit/_native.')
                  and name.endswith(('.so', '.pyd'))]
        require(len(native) == 1, 'Expected exactly one native extension')
        metadata_paths = [name for name in names if name.endswith('.dist-info/METADATA')]
        require(len(metadata_paths) == 1, 'Expected one distribution METADATA file')
        metadata = BytesParser().parsebytes(archive.read(metadata_paths[0]))
        require(metadata['Name'] == 'readability-kit' and bool(metadata['Version']),
                'Incorrect wheel name or version')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'python/dist')
    args = parser.parse_args()
    wheels = sorted(args.dist.resolve().glob('*.whl'))
    sources = sorted(args.dist.resolve().glob('*.tar.gz'))
    if len(wheels) != 1 or len(sources) != 1:
        raise SystemExit('Expected exactly one wheel and one sdist in --dist')
    validate_wheel(wheels[0])
    with tempfile.TemporaryDirectory(prefix='readability-python-') as temporary:
        temporary = Path(temporary)
        environment = temporary / 'venv'
        venv.EnvBuilder(with_pip=True).create(environment)
        python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        run(python, '-m', 'pip', 'install', '--no-index', '--no-deps', wheels[0], cwd=temporary)
        run(python, '-m', 'unittest', 'discover', '-s', ROOT / 'python/tests', '-v', cwd=temporary)
        run(python, '-c', 'import importlib.metadata as m, readability_kit as r; '
            'v=m.version(\"readability-kit\"); '
            'raise SystemExit(0 if v == r.__version__ == r._native.__version__ else 1)', cwd=temporary)
        run(python, '-m', 'readability_kit', '--version', cwd=temporary)
        executable = environment / ('Scripts/readability-kit.exe' if os.name == 'nt' else 'bin/readability-kit')
        run(executable, '--version', cwd=temporary)
        source_root = temporary / 'source'
        with tarfile.open(sources[0]) as archive:
            extract_source(archive, source_root)
        project_files = list(source_root.rglob('pyproject.toml'))
        require(len(project_files) == 1, f'Expected one pyproject.toml: {project_files}')
        project = project_files[0].parent
        run(sys.executable, '-m', 'maturin', 'build', '--release', '--locked',
            '--out', temporary / 'rebuilt', cwd=project)
        rebuilt = list((temporary / 'rebuilt').glob('*.whl'))
        require(len(rebuilt) == 1, 'Expected one rebuilt wheel')
        validate_wheel(rebuilt[0])
        run(python, '-m', 'pip', 'install', '--no-index', '--no-deps', '--force-reinstall', rebuilt[0], cwd=temporary)
        run(python, '-m', 'unittest', 'discover', '-s', ROOT / 'python/tests', '-v', cwd=temporary)
    print('Wheel install, CLI, notices, isolated sdist rebuild and rebuilt wheel tests passed.')


if __name__ == '__main__':
    main()
