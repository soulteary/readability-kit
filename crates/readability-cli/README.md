# Native CLI

Build from the repository root with `cargo build --release --workspace --locked`.
The `target/release/readability-kit` executable accepts the same arguments and
exit statuses as the JavaScript CLI. On Windows use the `.exe` suffix.

```sh
target/release/readability-kit article.html --url https://example.com/story
```

The Rust engine modes pass the locked JavaScript comparison corpus: 604/604
extraction cases and 282/282 readerability cases, with zero strict differences.
See [Rust parity acceptance](../../docs/RUST_PARITY.md) for scope and
[the compatibility contract](../../docs/RUST_COMPATIBILITY.md) for the protocol
and acceptance rules. CLI arguments, exit statuses and file handling are tested
separately from extraction parity.

`readability-kit-compat` and `readability-kit-bench` are internal JSON protocol
tools used by the repository's differential and performance scripts. They are
separate from the public CLI.
