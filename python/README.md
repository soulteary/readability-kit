# readability-kit for Python

Native article extraction using the existing Rust core, with Chromium and Mozilla
modes. No Node.js, subprocess, HTML script execution, or resource fetching is used
at runtime. This package has not been published to PyPI.

## Build and install locally

Requires CPython 3.10 or later, a Rust toolchain, and maturin 1.15.0 at build time.
A matching prebuilt wheel only requires Python at runtime. Ordinary GIL-enabled
CPython is the supported target; free-threaded Python and PyPy are not currently
in the validation matrix. The abi3 wheel targets CPython 3.10+ on its own OS and
architecture; it is not a universal binary.

From the repository root:

```sh
python3 -m venv python/.venv
# Windows: use python/.venv/Scripts/python.exe and maturin.exe below.
python/.venv/bin/python -m pip install maturin==1.15.0
cargo fetch --locked
python/.venv/bin/python tools/build-python-package.py
python/.venv/bin/python -m pip install --no-deps python/dist/*.whl
python/.venv/bin/python -m unittest discover -s python/tests -v
python/.venv/bin/python tools/check-python-package.py
```

The build helper runs preparation, creates the sdist, prunes unrelated workspace
packages from its lockfile offline (without changing retained versions), and builds
the wheel with `--locked`. The preparation step bundles dependency licenses, notices, and matching
MPL source. The default notices cover all target dependencies so the sdist can
be rebuilt on a different supported platform. Run preparation again when
Cargo.lock changes. `--target TRIPLE` restricts notices to one wheel target; do
not use that restricted staging for a portable sdist. Extension builds reject
stale lock snapshots and target mismatches. The isolated package check installs the
wheel into a new virtual environment, runs API/CLI tests, extracts the sdist,
rebuilds it outside this repository, and tests the rebuilt wheel. A cold build
needs network access for Cargo and Python build dependencies. None of these
commands publish or upload a package.

For editable development, prepare notices first and run `maturin develop` from
`python/` with the virtual environment activated. Release artifacts must be built
with the preparation step; the package check rejects missing notices.

## API

```python
from readability_kit import extract_html, is_probably_readerable

article = extract_html(
    '<article><p>' + 'Useful article prose. ' * 100 + '</p></article>',
    url='https://example.com/story',
    engine='chromium',
)
if article is not None:
    print(article.title)
    print(article.text_content)
    print(article.content)
    data = article.to_dict()                 # Python snake_case keys
    compatible = article.to_dict(camel_case=True)  # JavaScript Article keys
```

`extract_html(html, *, url, engine='chromium', char_threshold=500,
max_elems_to_parse=0, nb_top_candidates=5, keep_classes=False,
classes_to_preserve=(), disable_json_ld=False, link_density_modifier=0.0,
sanitize=True)` returns an immutable `Article` or `None` for no article.

`is_probably_readerable(html, *, engine='chromium', min_content_length=140,
min_score=20.0)` returns a heuristic boolean. False does not rule out extraction.

Both functions take Unicode strings, not bytes. Decode downloaded HTML using its
actual encoding before calling. Isolated Unicode surrogate code points are
rejected. No browser document or Shadow DOM API is provided; serialize and flatten
live browser content before calling if needed.

Article fields are `title`, `content`, `text_content`, `length`, `url`, `engine`,
`byline`, `dir`, `lang`, `excerpt`, `site_name`, and `published_time`. Optional
metadata is `None`. `length` counts UTF-16 code units for compatibility with the
other implementations; it can differ from `len(article.text_content)`.

Wrong argument types raise `TypeError`; invalid values (including non-HTTP(S)
URLs) raise `ValueError`. Unknown keyword arguments are rejected. Booleans are
not accepted as integer options. Native extraction failures, including exceeded
element limits, raise `ExtractionError`, a `RuntimeError` subclass. Zero
`max_elems_to_parse` means unlimited; the element limit is checked after parsing
and does not bound parser allocation. Integer options are bounded by
`sys.maxsize`; `link_density_modifier` must fit a finite float32. Sanitization defaults to true; `sanitize=False` skips the sanitizer
but retains semantic cleanup.

Calls own their data and release the GIL during native extraction, allowing
independent calls in a `ThreadPoolExecutor`. Calls are synchronous; no async API,
forced cancellation, or performance guarantee is provided. Input HTML is retained by an immutable Python-backed string while the GIL is released.
Options cross as typed fields, and the final Article is constructed from Rust
fields directly; neither uses an internal JSON round trip. Type annotations and `py.typed` are included.

## CLI

```sh
readability-kit article.html --url https://example.com/story --format json
cat article.html | python -m readability_kit - --url https://example.com/story --format text
readability-kit article.html --url https://example.com/story --engine mozilla --output article.json
```

Files/stdin are UTF-8 (an optional BOM is accepted). Formats are `json`, `html`,
and `text`. JSON uses the shared camelCase Article schema. Exit codes are 0 for
success/help/version, 2 for no article, and 1 for invalid arguments or errors.
Output files are atomically replaced after successful extraction; failures and
empty results preserve existing files. The command name matches the other
language CLIs, so use `python -m readability_kit` to explicitly select Python.

## Strict compatibility checks

After the local install above, from the repository root with JS dependencies
installed and the JavaScript bundle built:

```sh
mkdir -p python-reports
node tools/compatibility.mjs capture --output python-reports/javascript.json
node tools/compatibility.mjs capture-readerable --output python-reports/readerable.json
python/.venv/bin/python tools/python-compatibility.py --baseline python-reports/javascript.json --output python-reports/python.json
node tools/compatibility.mjs compare --baseline python-reports/javascript.json --candidate python-reports/python.json --output python-reports/extraction-diff.json
python/.venv/bin/python tools/python-compatibility.py --baseline python-reports/readerable.json --output python-reports/python-readerable.json
node tools/compatibility.mjs compare --baseline python-reports/readerable.json --candidate python-reports/python-readerable.json --output python-reports/readerable-diff.json
```

The Python capture tool keeps a 30-second timeout per isolated case and records
transport failures as failures; it avoids observed intermittent macOS Node
`spawnSync` stalls. The shared Node comparator still validates every field.
The adapter tests successful public API cases through the Python facade. Raw
engine cases and JS-specific invalid options use the private Rust compatibility
boundary, because the public Python API intentionally has stricter Python types
and different exceptions. Independent unit tests cover those Python semantics.
The private `_native` module and test transport are not a supported API.

Passing the locked corpus establishes compatibility for that corpus only, not
for every possible HTML input. The Rust sanitizer's independent browser tests
remain part of the existing Rust workflow.

## Distribution

CI builds and checks local artifacts on Linux, macOS, and Windows without a
publish job. Wheels target the runner OS and architecture. Portable manylinux
baselines, additional architectures and musllinux are not currently claimed. The sdist includes the local Rust core and patched dom_smoothie sources.
The package contains Apache/BSD/MIT/MPL and other dependency notices under
`readability_kit/_licenses`; review them when redistributing. Runtime Python has
no third-party Python dependencies.

## Performance

See [Python performance and binding overhead](../docs/PYTHON_PERFORMANCE.md) for
the same-corpus JavaScript/Go/Rust/Python comparison, CLI/RSS measurements,
independent boundary/conversion diagnostics, limitations and reproduction.

The optimized implementation and paired before/after measurements are documented
in [Python optimization](../docs/PYTHON_OPTIMIZATION.md). The benchmark input
loader decodes batches incrementally; the public API still accepts one HTML
string per call. Batch-worker RSS improvements do not imply that every library
caller reduces its per-article memory by the same percentage.

## Review and build integrity

The Cargo workspace version supplies both Python package metadata and
`__version__`. Package checks compare installed distribution/native versions,
validate every staged notice/source checksum, and remain active under Python
`-O`. Source archive extraction rejects links, traversal and non-portable path
collisions, without requiring the newer `tarfile.extractall(filter=...)` API.

The repository-only incremental benchmark loader now limits an incomplete JSON
value to 32 Mi characters by default (`max_value_chars`), in addition to its
256 KiB read chunks. This is a parsing-window guard, not a whole-process RSS
limit or a limit on the public single-HTML extraction API. Legal trailing JSON
whitespace is discarded incrementally. See [the Python review](../docs/PYTHON_REVIEW.md)
for findings and regression coverage.

Post-review four-language measurements, paired comparisons against both earlier
Python versions, CLI timings and memory regression checks are documented in
[Python post-review performance](../docs/PYTHON_REVIEW_PERFORMANCE.md).
