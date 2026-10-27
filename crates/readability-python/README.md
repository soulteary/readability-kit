# Python native extension

Private PyO3 binding crate for the `readability-kit` Python distribution.
Uses `readability-core`; extraction does not spawn processes or fetch resources.

Build release artifacts from the repository root with
`python tools/build-python-package.py` using an environment with maturin 1.15.0.
See [the Python package guide](../../python/README.md) for installation and tests.
The extension is tested through Python, so a Rust libpython test harness is disabled.
