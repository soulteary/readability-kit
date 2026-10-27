# Rust native parity acceptance

Evaluated on 2026-10-27. The Rust library and CLI now pass the locked extraction
and readerability corpus. Runtime extraction remains native Rust, with no Go or
JavaScript subprocess, virtual machine, test-answer lookup or cached article.
The npm backend remains JavaScript. This is measured corpus compatibility, not
formal equivalence for every possible HTML input or JavaScript option value.

## Exact differential acceptance

- Extraction: 130 original upstream pages plus 21 project fixtures, two engines,
  raw/public layers: **604/604 pass, zero differences**.
- Readerability: **282/282 pass, zero differences**.
- Independent JavaScript raw output through Rust cleanup: **290/290 pass**.

The existing comparator, JavaScript source/reference outputs, fixture inputs and
pass/fail rules are unchanged. HTML, text, UTF-16 length, metadata, omitted/null
properties, errors and result states are compared exactly. No normalization or
allowed-difference list is used to make the gate pass.

The previous 420 differing extraction cases became 41 after the first integrated
fixes; every remaining difference was HTML structure/serialization. The second
integrated pass reached zero.

## Native implementation changes

- Phrasing fragments follow the pinned JavaScript boundary-whitespace deletion
  and preserve the successor block for traversal.
- Candidate ancestor matching, cleanup order, ASCII title tokenization and
  UTF-16/ECMAScript whitespace scoring match the pinned algorithm.
- Byline discovery runs during the exact traversal point on each fallback
  attempt. It no longer deletes a byline subtree before its parent is prepared.
- Source comments, empty anchors, font attributes, wrapper identifiers and
  outer-to-inner attribute precedence are preserved according to the reference.
- srcset rewriting preserves original separator whitespace, and empty URL
  attributes are not resolved into the page URL.
- Base URLs are extraction metadata rather than synthetic DOM elements, so
  element limits continue to apply to the original input.
- A browser-style serializer preserves attribute order and literal `<`/`>` in
  attribute values while applying the correct text/attribute escaping.
- Native DOMPurify-derived HTML/SVG/MathML policy and portable semantic cleanup
  replace the prior more restrictive Ammonia policy. Ammonia is removed from the
  core dependency graph; Cargo.lock is updated.
- The JSON compatibility adapter validates public options in JavaScript order
  and handles raw constructor coercion separately, including file URLs,
  fractional thresholds, ignored wrapper-only fields and missing excerpt keys.

`crates/readability-core/src/content.rs` implements output policy and serialization.
The vendored engine changes are documented in
`crates/readability-core/vendor/dom_smoothie/READABILITY_KIT_PATCHES.md`.

## Validation

Local environment: macOS arm64, Apple M5, Rust/Cargo 1.99.1, Node 26.11.1.

- `cargo test --offline --workspace --locked`: **114 passed**, one optional
  differential fixture audit ignored by default; that audit was separately run
  and passed its 290 raw/API pairs.
- `cargo fmt --all --check`: passed.
- `cargo clippy --offline --workspace --all-targets --locked -- -D warnings`: passed.
- Actual Chromium sanitizer oracle/execution checks: **20/20 passed**, with
  working script/event negative controls and no execution or main navigation
  after cleaning.
- Native Playwright integration checks: **2/2 passed**, covering both engines.

No claim is made that the missing dom_smoothie upstream fixture corpus ran;
existing upstream-fixtures feature gates remain in place. Bounded tests and
browser payload checks do not establish safety for arbitrary input. Cross-platform
CI is configured; the local execution above is macOS only.

## Reproduction

```sh
bun install --frozen-lockfile
bun run build
cargo build --release --workspace --locked
mkdir -p rust-reports
node scripts/rust-compatibility.mjs capture --output rust-reports/javascript.json
node scripts/rust-compatibility.mjs run --baseline rust-reports/javascript.json --command ./target/release/readability-kit-compat --output rust-reports/differences.json
node scripts/rust-compatibility.mjs capture-readerable --output rust-reports/readerable-javascript.json
node scripts/rust-compatibility.mjs run --baseline rust-reports/readerable-javascript.json --command ./target/release/readability-kit-compat --output rust-reports/readerable-differences.json
READABILITY_RUST_COMPAT_BIN="$PWD/target/release/readability-kit-compat" node scripts/check-rust-sanitizer.mjs
cargo test --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

Every comparison report records the candidate binary SHA-256 and reference
source/runtime provenance. CI now blocks on any strict difference for every run,
including pull requests. No Go/Rust module publication, binary release or npm
backend replacement is part of this acceptance.

The performance rerun uses the unchanged 130-page corpus, seed, warmups,
repetitions, native serializers, RSS scope and fresh CLI measurement protocol.
Previous incompatible-Rust measurements remain historical evidence and are not
silently overwritten. See [performance results](PERFORMANCE.md).

## PR integration with main

The PR additionally retains main's root-identity selection, blank lazy-image source handling and saturating table-column counts. The public serializer obtains the selected root by identity as well. The merged workspace passes 119 Rust tests (one optional audit remains ignored by default); extraction and readerability acceptance are rerun for this integration. Existing performance measurements remain tied to their measured source snapshot; see PERFORMANCE.md.
