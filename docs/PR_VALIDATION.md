# PR integration validation

The PR integrates main at `c1298b3` and retains its lazy-image blank source,
selected-root identity and table-column saturation fixes. The exact public
serializer now obtains the extracted node by identity too.

Validation after integration on macOS arm64:

- Rust workspace: **119 passed**, one optional fixture audit ignored by default.
- Rust extraction: **604/604**, zero strict differences.
- Rust readerability: **282/282**, zero strict differences.
- Strict workspace Clippy and formatting: passed.
- Actual Chromium sanitizer/execution oracle: **20/20**, with working negative controls.
- Go source is unchanged from the measured snapshot; its complete race/vet,
  604/282 strict gates and browser checks remain recorded in the performance evidence.

The first extraction pass had one child exceed the existing 30-second transport
limit; a serial rerun passed all 604 cases using the same limit and comparator.
The successful post-integration reports, including binary/reference provenance,
are in [rust-extraction.json](pr-validation/rust-extraction.json) and
[rust-readerability.json](pr-validation/rust-readerability.json).

The historical timing measurements correspond to source snapshot
`d820cacd19c98a1eeb570952909f4c153c719ccf`; its tracked source files match the
recorded manifest hashes. The later Rust integration is separately validated
for correctness. Existing timing samples are preserved with their original
provenance. See [PERFORMANCE.md](PERFORMANCE.md).

## PR #4 CI and review follow-up

The initial GitHub run passed JavaScript CI, all Rust jobs, Go Linux/macOS
race tests and the Go strict/browser gates. Windows failed only because the
benchmark protocol test rejected a real zero elapsed duration. The test now
accepts zero (but rejects negative durations); production timing, historical
measurements and benchmark comparison rules are unchanged.

Both review findings are addressed:

- Go evaluates effective inline display and visibility declarations instead of
  substring matches, including duplicates, invalid values, comments, strings,
  variables and the pinned jsdom priority behavior. The API observations are
  reproducible with `node docs/pr-validation/inline-style-probe.mjs` after build
  (36 engine/case combinations). Go regression tests cover the same behavior.
- Go and Rust SVG filter policy keys consistently use lowercase lookups while
  preserving canonical SVG serialization. Regression tests cover mixed/lowercase
  input, retained filter primitives, unsafe attributes and unknown elements.

Final local validation on macOS arm64: Go race tests and vet passed; Rust
workspace tests passed **120 tests**, one optional audit ignored; formatting,
strict Clippy and release build passed. Both languages passed **604/604**
extraction and **282/282** readerability with zero differences against newly
captured pinned JavaScript baselines. The original strict comparator, fixtures
and reference implementation are unchanged. Both actual Chromium sanitizer
checks passed **20/20**, including their negative controls.

During local validation Rust had two extraction transport timeouts and one
readerability transport timeout. Full serial reruns passed using the original
30-second limit; no timeout or comparison rule was changed. Successful reports
with reference and binary hashes are retained as `pr4-{go,rust}-{extraction,readerable}.json`
in [pr-validation](pr-validation/). These are correctness reruns; historical
performance samples retain their original source provenance.
