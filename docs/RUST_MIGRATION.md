# Rust migration: implementation and acceptance status

Evaluated on 2026-10-26. The Rust library and CLI work without Node or a
JavaScript subprocess. They remain **experimental**: the strict compatibility
gate fails, so the npm backend remains JavaScript and Node bindings/WASM have
not been started. This follows the migration plan's prerequisite gates.

## Follow-up audit

A second review found and fixed omissions that the first acceptance pass missed:

- `classesToPreserve` interpolated strings into CSS selectors: `['']` could
  panic and punctuation-bearing class tokens were mishandled. It now compares
  literal tokens, with arbitrary-string and public-pipeline regressions.
- The public adapter inserted a synthetic base element, causing the backend's
  second element-count check to reject input exactly at `maxElemsToParse`.
  Limits now apply to the original input; both engines test N-1/N/N+1 with zero,
  one and multiple source base elements.
- Readerability counted Unicode scalar values instead of UTF-16 units and was
  absent from differential testing. It now has a separate protocol and
  **282/282 matching cases**, including emoji thresholds and invalid options.
- Malformed snapshots could pass self-comparison. The harness now validates
  case/result/Article shapes, HTML hashes, absent fields and boolean results;
  transport failures always fail. Provenance includes the actual JS bundle.
- Native artifact notices/checksums were incomplete. The packaging script now
  includes dependency notices, Rust standard-library notices, matching source
  for MPL-2.0 dependencies, member SHA-256 hashes and an archive checksum.
- PRs now receive strict extraction/readerability reports. A manual run still
  enforces the release gate; optional manual fuzz and benchmark jobs were added.

These fixes do not make extraction compatible. The 420/604 differing extraction
cases below remain, and cross-platform jobs have not been executed locally.

PR #2 review additionally found loss of text around a nested section and
incorrect relative-srcset resolution when a separator comma had no following
space. Both are corrected with helper-level and complete-pipeline regressions
for both engines. Whitespace-only wrappers still collapse, URL commas remain
intact during rewriting, and responsive image candidates survive default
sanitization. The extraction comparison still reports 420/604 differing cases.

A later review found an unchecked UTF-8 slice in video attribute matching and
relative link filenames beginning with `http` being skipped. Prefix suffix
checks now avoid Unicode-boundary panics; applicable links all pass through the
URL resolver. Regression cases cover both engines, sanitizer opt-out, source
bases and fragment handling. The fuzz seed generator includes the Unicode
iframe reproducer.
A subsequent public-adapter fix leaves empty and whitespace-only image sources
untouched until lazy-image recovery. Its full-pipeline regression covers both
engines, sanitization on/off, missing/blank/nonempty sources and source bases.
The link correction reduces differing extraction cases from 424 to 420 in the
604-case strict comparison; the compatibility gate remains failed.

Further review fixes carry the selected extraction root by node identity through
all attempts and parse policies, so source IDs cannot redirect the result.
Untrusted table column spans use saturating addition; extreme values cannot
panic or wrap. Regressions cover both engines and sanitizer modes, explicit
parse policies, fallback selection, and machine-limit column counts.

## Delivered

- Cargo workspace with `readability-core` and `readability-cli`, locked
  dependencies, native extraction, normalized Article fields and UTF-16 length.
- Mutable DOM via dom_query and a locally patched dom_smoothie 0.18.2 backend.
  Chromium mode includes targeted lead-image/caption, recipe, shopping,
  ad-break, JSON-LD, promotion and label adaptations. Mozilla mode retains the
  shared backend's Mozilla-derived behavior. Neither name certifies pinned
  engine equivalence.
- Default ammonia sanitization, media/MathML policy, semantic cleanup and source
  URL handling. The sanitizer is deliberately more restrictive than DOMPurify
  for SVG, some MathML and srcset schemes; its output is not policy-equivalent.
- File/stdin CLI, JSON/HTML/text, exit codes 0/1/2, and same-filesystem temporary
  output followed by rename. Failure-preservation tests cover existing output.
- Strict differential harness, versioned project fixtures, resident extraction
  and process-startup benchmarks, native browser checks and seeded fuzz target.
- CI configuration for Linux/macOS/Windows native checks and packaged artifacts,
  Chromium sanitizer checks, PR compatibility reports, a manual **strict**
  release gate, and optional manual fuzz/benchmark jobs.
  These jobs are configured; only the local macOS results below have been
  executed in this session. Nothing has been published.

The vendored fork preserves MIT attribution and Apache-2.0 engine-port notices.
Its `READABILITY_KIT_PATCHES.md` records modifications and missing upstream
fixture-corpus limitations. Fixture-dependent upstream tests are feature-gated;
their source remains present and their passage is not claimed.

## Compatibility result: failed gate

Inputs: 130 unchanged upstream HTML fixtures plus 21 versioned project fixtures,
each tested through two engines and two layers: **604 cases**.

- 184 cases match every compared field; **420 cases differ**.
- Chromium public API: 109/151 differing cases; raw engine: 101/151.
- Mozilla public API: 109/151 differing cases; raw engine: 101/151.
- Field differences: HTML 408, text 372, length 372, byline 8, excerpt 4.
  There are also 6 raw-layer status differences and 10 diagnostic-message
  differences. Fields overlap within cases; these are not independent failures.
- Of 372 text differences, 180 match after collapsing whitespace; another 188
  match only after removing **all** whitespace; 4 still differ in non-whitespace
  content. Whitespace removal is diagnostic only: it can hide changed word
  boundaries and is never used to pass a case.
- The four remaining non-whitespace text differences are Chromium's
  `webmd-1` and `webmd-2`, in both raw and public layers.
- Remaining author gaps are `firefox-nightly-blog` and `medicalnewstoday`,
  involving byline discovery during heuristic fallback. Raw excerpt differences
  also include absent-versus-null representation.
- Raw invalid-option cases expose intentional Rust typed-input restrictions:
  the JS constructor accepts some values rejected by the public JS wrapper;
  the native raw adapter still enforces typed options and HTTP(S) URLs. Do not
  attribute those differences to article selection.

The strict report exits 1. No allowlist, whitespace normalization or reference
snapshot replacement hides these differences. A passing extraction smoke test
is not a compatibility certificate.

Full local reports are generated under ignored `rust-reports/`: `javascript.json`,
`native.json`, `differences.json` and `benchmark.json`. The latter records binary
and lockfile hashes. Reproduce them with the commands below; generated reports
are not golden references to silently overwrite during migration.

The independent readerability report has 282 cases (130 upstream and 11 focused
inputs, two engines), zero differences including diagnostics. Its snapshots and
report use the `readerable-` prefix. This result does not certify extraction.

## Performance experiment

These measurements were recorded for the initial audited implementation in
`98080d3`, before the subsequent PR review corrections. They are not a benchmark
of the updated PR head.

Environment: Apple M5, macOS Darwin 25.5.0, Node 26.11.1, rustc 1.99.1;
Rust release build. Three fixtures were selected by 10th/50th/90th percentiles
of upstream input byte size. Resident measurements use 2 warmups and 20 timed
iterations, including parsing, extraction, default sanitizer and cleanup.

- `rtl-4`, 1,214 bytes: JS p50 5.280 ms, Rust 0.164 ms; 32.1x observed ratio.
- `ehow-2`, 107,092 bytes: JS p50 32.458 ms, Rust 2.048 ms; 15.9x ratio.
- `schema-org-context-object`, 459,526 bytes: JS p50 42.693 ms,
  Rust 2.319 ms; 18.4x ratio.

Only `rtl-4` has a matching text checksum in this sample. The other ratios
compare different output strings and must not be advertised as equivalent-work
speedups. This small sequential experiment establishes deployment potential,
not production throughput or a guarantee of future parity-preserving speed.

Three actual CLI invocations per fixture include process startup and JSON
serialization. Median JS times were 226.4/295.1/301.1 ms; Rust times were
3.1/5.1/6.2 ms. Maximum per-process RSS observed was approximately 137/182/190
MiB for JS and 3.6/5.6/7.0 MiB for Rust. These are fresh processes, not flushed
filesystem caches. The report retains all samples and p95 resident timings.
Heavy checks/fuzzing were stopped before the recorded final measurement.

## Executed validation

- `cargo fmt --all --check` and strict workspace Clippy pass.
- 98 Rust unit/integration tests pass, including upstream fixture-free tests,
  10 focused Chromium tests, 18 adversarial payload checks across engine modes,
  128 deterministic malformed inputs, Unicode, URL and output-preservation tests.
- JS integration/tool tests: 33 pass after the audit, including eight snapshot
  checks and a release-gate reporting test. The earlier full check also passed
  1,984 unchanged upstream assertions, the 130-page raw comparison and isolated
  npm package smoke test.
- Seven real Chromium tests pass, including native output fragment/document
  reparsing for both modes and the original live Shadow DOM/slot tests.
- The seeded libFuzzer run before the PR review corrections used nightly Rust
  and AddressSanitizer:
  **3,553 executions in 61 seconds** after strengthening the target, exit 0,
  no discovered crash or timeout. It varies arbitrary class-preservation
  strings, exercises both engines, and checks UTF-16 length plus all serialized
  article fields, empty results and errors for repeatability.
  Inputs are capped at 256 KiB with a 5-second execution timeout and a 10,000
  element extraction cap. This bounded run is not exhaustive safety evidence.
- A fresh seeded run after the Unicode video-attribute fix completed **3,478
  executions in 61 seconds**, exit 0, with no discovered crash or timeout.
  Its seeds include the reported iframe reproducer alongside the existing corpus.
- Strict full JS/Rust compatibility: **fails**, as detailed above.
- Native archive smoke check: all member and archive hashes verified; 105
  normal/build dependency notice records included for the local macOS target.

During implementation, adversarial tests caught unchecked dangerous srcset
schemes; the filter was fixed and verified in both Rust and real Chromium.
Metadata tests also caught author over-selection, whitespace loss and invalid
numeric-entity decoding. Those fixes are covered by regressions.

## Next decision and remaining work

Keep the candidate available for native experiments, but stop default-backend
migration at the failed gate. The original 6–9 person-week estimate was a
planning estimate, not a statement that full migration has been completed here.

Before production replacement, the next implementation phase must:

1. Align tree/text serialization and preserve JS whitespace semantics without
   trimming or normalizing away word-boundary changes.
2. Port fallback traversal and byline-discovery order, plus the remaining
   Chromium WebMD selection differences, against the pinned source.
3. Audit all scoring lengths for UTF-16 semantics and all option branches for
   exact behavior, beyond the current output-length guarantee.
4. Define accepted sanitizer policy differences explicitly, then add precise
   regression assertions. Keep content correctness and security review separate.
5. Separate permissive raw JS-constructor compatibility from strict public
   validation and align absent/null metadata and diagnostic formatting. Audit
   extraction's unknown-field and null-engine behavior too: Rust serde currently
   rejects values that JS ignores/defaults. Readerability's protocol now handles
   these explicitly, but that does not complete extraction's option audit.
6. Rerun all strict cases, browser checks, fuzz and equivalent-output benchmarks.
   Then execute the configured CI matrix on Linux and Windows too.

Given the breadth of shared-backend differences, a direct pinned-algorithm port
may be more maintainable than accumulating more compatibility wrappers. Choose
that route before further bindings work. Node bindings require the compatibility
and performance gates first; WASM additionally requires a browser serialization
and Shadow DOM bridge experiment. Neither is a completed deliverable here.

## Reproduction

Use a supported Node version from package.json and current stable Rust.

```sh
npm ci
npm run build
cargo build --release --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
mkdir -p rust-reports
node scripts/rust-compatibility.mjs capture --output rust-reports/javascript.json
node scripts/rust-compatibility.mjs run --baseline rust-reports/javascript.json --command ./target/release/readability-kit-compat --candidate-output rust-reports/native.json --output rust-reports/differences.json
# The preceding command currently exits 1. Run benchmarks separately.
node scripts/rust-compatibility.mjs capture-readerable --output rust-reports/readerable-javascript.json
node scripts/rust-compatibility.mjs run --baseline rust-reports/readerable-javascript.json --command ./target/release/readability-kit-compat --candidate-output rust-reports/readerable-native.json --output rust-reports/readerable-differences.json
node scripts/benchmark-rust.mjs --iterations 20 --output rust-reports/benchmark.json
python3 scripts/package-rust.py --output rust-reports/native.zip
npx playwright install chromium
READABILITY_RUST_BIN="$PWD/target/release/readability-kit" npm run test:browser
node scripts/seed-rust-fuzz.mjs
cargo +nightly fuzz run extract_html --fuzz-dir fuzz -- -max_total_time=60 -timeout=5 -max_len=262144
```

Windows binaries use `.exe`; set the browser environment variable using the
platform's shell. Fuzzing additionally requires cargo-fuzz and nightly Rust.
