# Rust migration compatibility contract

The JavaScript implementation remains the reference. A Rust build or a successful
extraction is not evidence of parity. Do not change the default npm backend until
compatibility and end-to-end performance have been measured.

Current locked-corpus acceptance is 604/604 extraction cases and 282/282
readerability cases, with zero strict differences. The native sanitizer also
passes 20 browser oracle cases and the two native browser tests. See
[Rust parity acceptance](RUST_PARITY.md) for fixes, validation and scope. These
results establish compatibility for the recorded corpus, not all possible HTML.

## Reproducible checks

Use a supported Node version from package.json and install locked dependencies.

```sh
bun install --frozen-lockfile
bun run build
node tools/compatibility.mjs capture --output /tmp/readability-js.json
node tools/compatibility.mjs compare --baseline /tmp/readability-js.json --candidate /tmp/readability-js.json
node --test tests/compatibility.test.mjs
cargo build --release --workspace
node tools/compatibility.mjs run --baseline /tmp/readability-js.json --command ./target/release/readability-kit-compat --output /tmp/readability-rust-diff.json
node tools/benchmark-rust.mjs --output /tmp/readability-benchmark.json
node tools/compatibility.mjs capture-readerable --output /tmp/readability-readerable-js.json
node tools/compatibility.mjs run --baseline /tmp/readability-readerable-js.json --command ./target/release/readability-kit-compat --output /tmp/readability-readerable-diff.json
```

Capture contains both engine modes and both raw-engine and complete public API
layers for every upstream source.html and the additional project fixtures.
Input HTML, SHA-256, options, source hashes, package version, upstream manifest,
full article, and error/empty state are recorded. Capture is intentionally a
local generated artifact, not a replacement for versioned upstream fixtures.
The 30-second per-case candidate timeout bounds runaway candidate processes.
An invocation processes one JSON request and exits. It must never execute HTML
scripts or fetch resources.

Request: `{html, options, layer}`. Layers are `raw`, `api` and `readerable`. Response is an
Article or null, or `{status: "ok"|"empty"|"error", article, error?}`. Native
error envelopes must exit zero so their semantic error can be compared; a
nonzero exit is a transport failure. Raw articles retain upstream fields;
API articles retain all public camelCase fields. Readerable uses its own options
and returns `{status: "ok", article: boolean}`; false is a successful heuristic
result, not an empty article. Its independent capture contains 282 cases and
does not change the 604 extraction cases.

Case, envelope and Article structures are validated before comparison. HTML
hashes are recomputed; malformed snapshots cannot pass by comparing to themselves.
Transport failures are marked separately and always fail. Provenance records the
actual packages/javascript/dist/node.js bundle in addition to source and dependency hashes.

Comparison is deliberately strict: all field, option, layer, input hash, missing
case, extra case, status and error differences fail. Whitespace normalization
is diagnostic only. HTML serialization differences are not silently accepted.
The report includes full changed values so a reviewer can assess exact changes.
There is no percentage threshold and no allowlist to hide regressions.
When accepting a deliberate difference, document it and add a targeted test;
do not overwrite the JavaScript reference with the Rust output.

## Required behavior

- Article fields: title, byline, dir, lang, content, textContent, length,
  excerpt, siteName, publishedTime, url, engine. Nullable metadata uses null;
  title always uses a string. Absent and empty values are distinct in the diff.
- length is UTF-16 code units of final textContent, not bytes or Unicode scalar
  values. Engine scoring follows the reference UTF-16 and whitespace semantics.
- Default engine is chromium. Mozilla and Chromium each compare against their
  own reference. Invalid supported option values must fail explicitly; unknown
  public option keys are ignored as in JavaScript.
- HTTP(S) URL validation and canonicalization precede extraction. Source base
  resolution and relative links/media must match. No network resource loading.
- Public API order is clone/source preparation, engine, optional sanitizer,
  semantic cleanup, then final textContent and length.
- Sanitizer removes event attributes, unsafe URL schemes, style attributes,
  style tags and interactive form controls. Security differences require
  independent browser verification; matching a baseline alone is insufficient.
- charThreshold >= 1, maxElemsToParse >= 0 and nbTopCandidates >= 1 are finite
  integers. linkDensityModifier is finite. Boolean and string-array options
  require their declared types. Null numeric/boolean values are invalid;
  `engine: null` follows JavaScript's nullish Chromium default. Preserve exact
  validation order and error messages. The JSON compatibility adapter ignores
  unknown keys and preserves the raw engine's coercion rules. The typed Rust
  options API remains a separate interface.
- CLI behavior is a separate contract: stdin/file input, arguments, output
  modes, stdout/stderr, and exit codes 0/1/2. An extraction/write failure must
  preserve an existing output file.
- Browser Shadow DOM/slot flattening remains JavaScript until a browser adapter
  has passed the existing browser tests. HTML strings cannot encode live slots.

## Test scope and remaining acceptance work

The 21 versioned project fixtures cover Chinese/emoji/combining characters,
relative base/media, unsafe content, JSON-LD, no article, invalid threshold,
element count limits, Chromium hero/cite, recipe, shopping, ad-break, class
retention, sanitizer opt-out, candidate count, density modifier and malformed
namespaces. With 130 upstream sources, capture currently produces 604 cases.
The 604 extraction and 282 readerability cases pass strictly. The workspace
test suite passes 114 tests with one optional corpus audit ignored by default;
that audit separately passes all 290 raw/API content cases.
Raw-layer invalid-option behavior is intentionally upstream behavior; only the
public layer validates wrapper options. Existing core/CLI/browser tests remain
required. The native contract tests, seeded fuzz target and opt-in Chromium
reparse tests add independent robustness coverage; no bounded run establishes
complete sanitizer or parser correctness. Unicode and adversarial examples must not be replaced by aggregate
upstream pass counts.

Benchmark cold CLI and steady-state extraction separately with release Rust,
including parsing, default sanitization and serialization. Record input sizes,
hardware/runtime versions, peak RSS and p50/p95; a faster uncleaned raw engine
cannot establish end-to-end benefit. Native bindings and WASM are separate
stages, gated on compatibility and measured value.
