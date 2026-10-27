"""Packaging gates are exercised without building for each negative fixture."""
import hashlib
import importlib.util
import io
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

TOOLS = Path(__file__).resolve().parents[2] / 'tools'


@unittest.skipUnless((TOOLS / 'python_package_utils.py').exists(), 'repository packaging tools')
class PackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(TOOLS))
        try:
            spec = importlib.util.spec_from_file_location('package_check', TOOLS / 'check-python-package.py')
            cls.check = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.check)
            import python_package_utils
            cls.utils = python_package_utils
        finally:
            sys.path.pop(0)

    def test_rust_metadata_uses_utf8_on_non_utf8_hosts(self):
        spec = importlib.util.spec_from_file_location('package_rust', TOOLS / 'package-rust.py')
        packager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(packager)
        with tempfile.TemporaryDirectory() as directory:
            sysroot = Path(directory) / '依赖'
            notices = sysroot / 'share/doc/rust'
            notices.mkdir(parents=True)
            (notices / 'COPYRIGHT-library.html').write_bytes(b'notice')
            metadata = json.dumps({'description': '依赖', 'packages': [], 'resolve': {'nodes': []}},
                                  ensure_ascii=False).encode('utf-8')

            def output(command, **kwargs):
                if command[0] == 'cargo':
                    raw = metadata
                elif '--print' in command:
                    raw = str(sysroot).encode('utf-8')
                else:
                    raw = b'host: test-target\n'
                # Simulate the Windows default that failed in CI. Both Cargo
                # metadata and rustc paths must explicitly opt into UTF-8.
                return raw.decode(kwargs.get('encoding', 'cp1252'))

            with patch.object(packager.subprocess, 'check_output', side_effect=output):
                files, count = packager.collect(include_binary=False, all_targets=True)
            self.assertEqual(count, 0)
            self.assertEqual(files['licenses/rust-stdlib/COPYRIGHT-library.html'], b'notice')

    @unittest.skipUnless(shutil.which('rustc'), 'Rust compiler required for build-script regression')
    def test_build_rejects_stale_lock_and_wrong_target_notices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            crate = root / 'crates/readability-python'
            crate.mkdir(parents=True)
            metadata = root / 'python/src/readability_kit/_licenses'
            metadata.mkdir(parents=True)
            lock = 'version = 4\n[[package]]\nname = "test"\nversion = "1.0"\n'
            (root / 'Cargo.lock').write_text(lock)
            (metadata / 'Cargo.lock').write_text(lock)
            (metadata / 'TARGET').write_text('test-target\n')
            for name in ['DEPENDENCIES.json', 'LICENSE', 'NOTICE', 'SHA256SUMS']:
                (metadata / name).write_text('fixture')
            binary = root / ('guard.exe' if os.name == 'nt' else 'guard')
            env = dict(os.environ, CARGO_MANIFEST_DIR=str(crate))
            subprocess.run(['rustc', '--edition=2021', str(TOOLS.parent / 'crates/readability-python/build.rs'),
                            '-o', str(binary)], env=env, check=True, capture_output=True)
            env.update(CARGO_FEATURE_EXTENSION_MODULE='1', TARGET='test-target')
            self.assertEqual(subprocess.run([str(binary)], env=env, capture_output=True).returncode, 0)
            (root / 'Cargo.lock').write_text(lock.replace('1.0', '2.0'))
            result = subprocess.run([str(binary)], env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'Stale Python dependency notices', result.stderr)
            (root / 'Cargo.lock').write_text(lock)
            env['TARGET'] = 'different-target'
            result = subprocess.run([str(binary)], env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'notices target mismatch', result.stderr)
            (metadata / 'TARGET').write_text('all\n')
            self.assertEqual(subprocess.run([str(binary)], env=env, capture_output=True).returncode, 0)

    def wheel(self, path, *, corrupt=False, extra=False, native=True, duplicate=False):
        prefix = 'readability_kit/_licenses/'
        notices = {'LICENSE': b'license', 'NOTICE': b'notice',
                   'DEPENDENCIES.json': json.dumps({'target': 'all', 'packages': [{'name': 'pyo3'}]}).encode(),
                   'TARGET': b'all\n', 'Cargo.lock': b'lock snapshot',
                   'source/example/lib.rs': b'// matching source'}
        files = {prefix + name: value for name, value in notices.items()}
        files[prefix + 'SHA256SUMS'] = ''.join(
            f'{hashlib.sha256(value).hexdigest()}  {name}\n'
            for name, value in notices.items()).encode()
        if corrupt:
            files[prefix + 'LICENSE'] = b'changed'
        if extra:
            files[prefix + 'unlisted'] = b'not covered'
        files['readability_kit/py.typed'] = b''
        if native:
            files['readability_kit/_native.abi3.so'] = b'test fixture, not loaded'
        files['readability_kit-0.1.0.dist-info/METADATA'] = b'Name: readability-kit\nVersion: 0.1.0\n'
        with zipfile.ZipFile(path, 'w') as archive:
            for name, value in files.items():
                archive.writestr(name, value)
            if duplicate:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    archive.writestr('readability_kit/py.typed', b'')

    def test_wheel_requires_complete_integrity_manifest_and_one_extension(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.whl'
            self.wheel(path)
            self.check.validate_wheel(path)
            for options in ({'corrupt': True}, {'extra': True}, {'native': False}, {'duplicate': True}):
                with self.subTest(options=options):
                    self.wheel(path, **options)
                    with self.assertRaises(ValueError):
                        self.check.validate_wheel(path)

    def test_integrity_gate_is_not_disabled_by_python_optimization(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.whl'
            self.wheel(path, corrupt=True)
            code = '''import importlib.util, sys
sys.path.insert(0, sys.argv[1])
s = importlib.util.spec_from_file_location('check', sys.argv[1]+'/check-python-package.py')
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
try: m.validate_wheel(sys.argv[2])
except ValueError: raise SystemExit(0)
raise SystemExit(7)
'''
            result = subprocess.run([sys.executable, '-O', '-c', code, str(TOOLS), str(path)], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def archive(self, members):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as archive:
            for name, kind in members:
                info = tarfile.TarInfo(name)
                if kind == 'file':
                    info.size = 4
                    archive.addfile(info, io.BytesIO(b'text'))
                else:
                    info.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
                    info.linkname = '../../outside'
                    archive.addfile(info)
        stream.seek(0)
        return tarfile.open(fileobj=stream)

    def test_extract_regular_source_and_reject_unsafe_members_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'valid'
            with self.archive([('root/main.py', 'file')]) as archive:
                root = self.utils.extract_source(archive, destination)
            self.assertEqual((root / 'main.py').read_text(), 'text')
            for index, members in enumerate([
                [('root/../outside', 'file')], [('/outside', 'file')],
                [('root/link', 'symlink')], [('root/link', 'hardlink')],
                [('root/file', 'file'), ('root/FILE', 'file')],
                [('a/file', 'file'), ('b/file', 'file')],
                [('root/C:stream', 'file')], [('.', 'file')],
                [('root/.. /outside', 'file')], [('root/NUL.txt', 'file')],
            ]):
                destination = Path(directory) / str(index)
                with self.subTest(members=members), self.archive(members) as archive:
                    with self.assertRaises(ValueError):
                        self.utils.extract_source(archive, destination)
                    self.assertFalse(destination.exists())
