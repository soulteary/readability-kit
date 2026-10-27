# Repository tools

Run tools from the repository root unless the command is a package build/prepack.

- Build: `build.mjs`, `build-wasm.mjs`.
- Package validation (including the real prepack lifecycle): `check-package.mjs`, `check-wasm-package.mjs`, `check-go-module.mjs`.
- Python: `build-python-package.py` builds local wheel/sdist artifacts;
  `prepare-python-package.py` collects dependency notices and MPL sources;
  `check-python-package.py` verifies isolated installation and sdist rebuilding;
  `python-compatibility.py` captures isolated candidates for the shared comparator.
- Packaging: `package-rust.py`, `package-wasm.py`, `package-benchmark.py`.
- Shared contracts: `compatibility.mjs`; `go-compatibility.mjs` is a Go runner.
- Security/browser gates: `check-*-sanitizer.mjs`, `test-wasm.mjs`.
- Upstream: `verify-upstream.mjs`, `compare-upstream.mjs`, `import-mozilla-history.sh`.
- Performance: `benchmark-*`, `summarize-benchmark.mjs`, `render-benchmark.mjs`.

The public entry commands remain in the private root `package.json`.
The `go/`, `crates/` and `vendor/` locations are unchanged.

Python performance uses `benchmark-all.mjs --include-python` with
`benchmark-python-worker.py`; `profile-python.py` and
`summarize-python-profile.py` measure independent stage diagnostics.
`profile-python-memory.py` probes import/input-only RSS.
`render-python-benchmark.mjs` and `package-python-benchmark.py` create the offline
report and source/evidence archive. Keep profiling separate from timing runs.

### Post-review Python benchmark

`benchmark-python-paired.py --reference-python ... --reference-worker ... --with-cli`
compares the original, optimized/pre-review and current Python runtimes in one
interleaved run. `summarize-python-regression.py` resamples whole paired replicates;
`benchmark-python-memory-control.py` adds a separate 12-pair RSS experiment.
Render with `render-python-reviewed.mjs` then `augment-python-reviewed.mjs`, check
with both `check-python-benchmark.mjs` and `check-python-reviewed.mjs`, and archive
with `package-python-reviewed.py`. See [the measured protocol and results](../docs/PYTHON_REVIEW_PERFORMANCE.md).
