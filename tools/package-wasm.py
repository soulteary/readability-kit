#!/usr/bin/env python3
"""Collect target-specific dependency notices and MPL source for the WASM npm package."""
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
ROOT = Path(__file__).resolve().parent.parent
spec = spec_from_file_location("package_rust", ROOT / "tools/package-rust.py")
module = module_from_spec(spec)
spec.loader.exec_module(module)
files, count = module.collect(
    binary_path=ROOT / "packages/wasm/pkg/readability_wasm_bg.wasm",
    root_package="readability-wasm", target="wasm32-unknown-unknown")
for name, data in files.items():
    if name in {"LICENSE", "NOTICE", "Cargo.lock", "DEPENDENCIES.json"} or name.startswith(("licenses/", "source/", "LICENSES/")):
        destination_name = "dependencies.json" if name == "DEPENDENCIES.json" else name.replace("licenses/", "dependency-licenses/", 1)
        destination = ROOT / "packages/wasm" / destination_name
        if name == "DEPENDENCIES.json":
            data = data.replace(b"licenses/", b"dependency-licenses/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
print(f"Collected {count} WASM dependency notices and corresponding MPL sources")

for name in ["UPSTREAM.md", "PATCHES.md", "upstream.json"]:
    (ROOT / "packages/wasm" / name).write_bytes((ROOT / name).read_bytes())
