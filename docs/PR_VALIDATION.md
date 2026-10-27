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
