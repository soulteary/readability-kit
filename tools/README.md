# Repository tools

Run tools from the repository root unless the command is a package build/prepack.

- Build: `build.mjs`, `build-wasm.mjs`.
- Package validation (including the real prepack lifecycle): `check-package.mjs`, `check-wasm-package.mjs`, `check-go-module.mjs`.
- Packaging: `package-rust.py`, `package-wasm.py`, `package-benchmark.py`.
- Shared contracts: `compatibility.mjs`; `go-compatibility.mjs` is a Go runner.
- Security/browser gates: `check-*-sanitizer.mjs`, `test-wasm.mjs`.
- Upstream: `verify-upstream.mjs`, `compare-upstream.mjs`, `import-mozilla-history.sh`.
- Performance: `benchmark-*`, `summarize-benchmark.mjs`, `render-benchmark.mjs`.

The public entry commands remain in the private root `package.json`.
The `go/`, `crates/` and `vendor/` locations are unchanged.
