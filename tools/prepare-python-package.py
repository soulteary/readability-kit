#!/usr/bin/env python3
"""Collect locked native dependency notices and matching MPL sources before building.

Run from any directory with the Rust toolchain available. Does not publish.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("package_rust", ROOT / "tools/package-rust.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="Restrict notices to one wheel target; default includes all targets for portable sdists")
    args = parser.parse_args()
    files, count = packager.collect(root_package="readability-python", target=args.target,
                                    include_binary=False, all_targets=args.target is None)
    files["TARGET"] = (json.loads(files["DEPENDENCIES.json"])["target"] + "\n").encode()
    # Avoid LICENSES/ versus licenses/ collisions on case-insensitive hosts.
    files.pop("SHA256SUMS")
    files = {(name.replace("LICENSES/", "project-licenses/", 1)
              if name.startswith("LICENSES/") else name): data
             for name, data in files.items()}
    files["SHA256SUMS"] = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n"
        for name, data in sorted(files.items())
    ).encode()
    destination = ROOT / "python/src/readability_kit/_licenses"
    if destination.exists():
        shutil.rmtree(destination)
    for name, data in files.items():
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f"Prepared {count} dependency notices and corresponding MPL sources in {destination}")


if __name__ == "__main__":
    main()
