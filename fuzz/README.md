# Native extraction robustness

The deterministic malformed-HTML and sanitizer acceptance corpus runs without extra tools:

```sh
cargo test -p readability-core --test native_contract --offline
```

The separate workspace here is optional and requires `cargo-fuzz` plus a nightly Rust toolchain. It is not included in normal workspace builds. Run from the repository root:

```sh
node tools/seed-rust-fuzz.mjs
cargo +nightly fuzz run extract_html --fuzz-dir fuzz -- -max_total_time=60 -timeout=5 -max_len=262144
```

The target exercises both engines, detects panics and checks UTF-16 length.
It varies arbitrary class-preservation strings and compares all serialized
article fields, empty results and errors for repeatability. HTML parsing does
not execute scripts or fetch resources. A deterministic corpus is not equivalent
to a libFuzzer run; report fuzz execution separately. Generated corpus and
artifact files should remain local.
