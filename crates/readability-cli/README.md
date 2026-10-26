# Native CLI (experimental)

Build from the repository root with `cargo build --release --workspace --locked`.
The `target/release/readability-kit` executable accepts the same arguments and
exit statuses as the JavaScript CLI. On Windows use the `.exe` suffix.

```sh
target/release/readability-kit article.html --url https://example.com/story
```

The Rust engine modes are compatibility candidates, not certified replacements
for the pinned JavaScript engines. See `docs/RUST_COMPATIBILITY.md` and
`docs/RUST_MIGRATION.md` at the repository root before adopting them.

`readability-kit-compat` and `readability-kit-bench` are internal JSON protocol
tools used by the repository's differential and performance scripts. They are
separate from the public CLI.
