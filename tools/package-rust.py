#!/usr/bin/env python3
"""Package a native executable, dependency notices and SHA-256 manifests."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def collect(*, binary_path=None, root_package="readability-cli", target=None, include_binary=True, all_targets=False):
    suffix = ".exe" if os.name == "nt" else ""
    binary = binary_path or ROOT / "target" / "release" / f"readability-kit{suffix}"
    if include_binary and not binary.is_file():
        raise RuntimeError("Build first: cargo build --release --workspace --locked")
    version = subprocess.check_output(["rustc", "-vV"], text=True)
    host = target or next(line.removeprefix("host: ") for line in version.splitlines() if line.startswith("host: "))
    metadata_command = ["cargo", "metadata", "--locked", "--offline", "--format-version", "1"]
    if not all_targets:
        metadata_command.extend(["--filter-platform", host])
    metadata = json.loads(subprocess.check_output(metadata_command, cwd=ROOT, text=True))
    packages = {p["id"]: p for p in metadata["packages"]}
    nodes = {n["id"]: n for n in metadata["resolve"]["nodes"]}
    pending = [p["id"] for p in packages.values() if p["name"] == root_package]
    visited = set()
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        for dep in nodes[current]["deps"]:
            # Include normal/build dependencies for the active host target.
            if any(kind["kind"] != "dev" for kind in dep["dep_kinds"]):
                pending.append(dep["pkg"])
    files = {
        "LICENSE": (ROOT / "LICENSE").read_bytes(),
        "NOTICE": (ROOT / "NOTICE").read_bytes(),
        "Cargo.lock": (ROOT / "Cargo.lock").read_bytes(),
        "RUST_MIGRATION.md": (ROOT / "docs/RUST_MIGRATION.md").read_bytes(),
    }
    if include_binary:
        files[binary.name] = binary.read_bytes()
    for path in sorted((ROOT / "LICENSES").rglob("*")):
        if path.is_file():
            files[f"LICENSES/{path.relative_to(ROOT / 'LICENSES').as_posix()}"] = path.read_bytes()
    sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
    rust_notices = sysroot / "share/doc/rust"
    library_notice = rust_notices / "COPYRIGHT-library.html"
    if not library_notice.is_file():
        raise RuntimeError("Rust toolchain is missing COPYRIGHT-library.html; cannot package standard-library notices")
    files["licenses/rust-stdlib/COPYRIGHT-library.html"] = library_notice.read_bytes()
    for path in sorted((rust_notices / "licenses").glob("*")):
        if path.is_file():
            files[f"licenses/rust-stdlib/{path.name}"] = path.read_bytes()
    files["licenses/rust-stdlib/rustc-version.txt"] = version.encode()
    records = []
    for identity in sorted(visited):
        package = packages[identity]
        directory = Path(package["manifest_path"]).parent
        prefix = f"licenses/{package['name']}-{package['version']}"
        selected = set()
        for path in directory.iterdir():
            if path.name.lower().startswith(("license", "licence", "copying", "copyright", "notice")):
                if path.is_file():
                    selected.add(path)
                elif path.is_dir():
                    selected.update(p for p in path.rglob("*") if p.is_file())
        if package.get("license_file"):
            selected.add(directory / package["license_file"])
        # Workspace-owned source inherits the root project license and notice.
        if package["name"] in {"readability-cli", "readability-core", "readability-wasm", "readability-python"}:
            selected.update([ROOT / "LICENSE", ROOT / "NOTICE"])
        license_origin = "package files"
        if not selected and package["license"] == "MPL-2.0":
            # selectors' crate release has MPL headers but omits the license
            # text. Use the identical canonical text shipped with cssparser.
            canonical = next((Path(p["manifest_path"]).parent / "LICENSE"
                              for p in packages.values() if p["name"] == "cssparser"
                              and p["license"] == "MPL-2.0"), None)
            if canonical and canonical.is_file():
                selected.add(canonical)
                license_origin = "canonical MPL-2.0 text from locked cssparser package"
        if not selected:
            raise RuntimeError(f"Missing license text: {package['name']} {package['version']}")
        copied = []
        for path in sorted(selected):
            try:
                relative = path.resolve().relative_to(directory.resolve()).as_posix()
            except ValueError:
                relative = path.name
            name = f"{prefix}/{relative}"
            files[name] = path.read_bytes()
            copied.append(name)
        source_prefix = None
        if package["license"] == "MPL-2.0":
            # Ship the matching source form alongside the executable instead
            # of relying on an external repository remaining available.
            source_prefix = f"source/{package['name']}-{package['version']}"
            for path in sorted(directory.rglob("*")):
                if path.is_file() and not path.is_symlink() and not any(
                    part.startswith(".") for part in path.relative_to(directory).parts
                ):
                    files[f"{source_prefix}/{path.relative_to(directory).as_posix()}"] = path.read_bytes()
        records.append({"name": package["name"], "version": package["version"],
                        "license": package["license"], "source": package["source"],
                        "notices": copied, "licenseTextOrigin": license_origin,
                        "bundledSource": source_prefix})
    files["DEPENDENCIES.json"] = (json.dumps({
        "scope": ("Normal/build dependency closure for all targets; dev-only dependencies excluded."
                  if all_targets else "Normal/build dependency closure for the recorded target; dev-only dependencies excluded."),
        "target": "all" if all_targets else host,
        "packages": records,
    }, indent=2) + "\n").encode()
    files["licenses/dom_smoothie-0.18.2/READABILITY_KIT_PATCHES.md"] = (
        ROOT / "crates/readability-core/vendor/dom_smoothie/READABILITY_KIT_PATCHES.md"
    ).read_bytes()
    files["SHA256SUMS"] = "".join(
        f"{sha256(data)}  {name}\n" for name, data in sorted(files.items())
    ).encode()
    return files, len(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    files, count = collect()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name in {"readability-kit", "readability-kit.exe"} else 0o100644) << 16
            archive.writestr(info, data)
    checksum = sha256(args.output.read_bytes())
    args.output.with_name(args.output.name + ".sha256").write_text(
        f"{checksum}  {args.output.name}\n", encoding="utf-8"
    )
    print(f"Packaged {len(files)} files and {count} dependency notices: {args.output}")


if __name__ == "__main__":
    main()
