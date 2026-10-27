# Native extraction core

This crate contains a native Rust implementation, with no JavaScript subprocess
or network fetching during extraction. The mutable HTML DOM and extraction
backend are dom_query and a locally patched dom_smoothie 0.18.2. The pinned
JavaScript implementation remains the compatibility reference and default
published implementation.

```rust
use readability_core::{extract_html, ExtractOptions};
let options = ExtractOptions {
    url: Some("https://example.com/article".into()),
    ..ExtractOptions::default()
};
let article = extract_html("<article><p>Article text.</p></article>", &options)?;
# Ok::<(), readability_core::Error>(())
```

`extract_html` validates options and URL, parses inert HTML, resolves the source
base, extracts with the selected backend mode, sanitizes by default, applies
semantic cleanup, and calculates final text length in UTF-16 code units.
`extract_raw_html` skips the final sanitizer and semantic cleanup and is intended
for differential testing. It is not safe HTML output for direct rendering.

`Engine::Mozilla` uses the Mozilla-derived backend behavior;
`Engine::Chromium` enables local Chromium adaptations. Both modes pass the
repository's locked JavaScript comparison corpus: 604/604 extraction cases and
282/282 readerability cases, with zero strict differences. See
[Rust parity acceptance](../../docs/RUST_PARITY.md) for scope and reproduction;
this corpus does not establish equivalence for every possible HTML input.

The sanitizer implements the reference DOMPurify policy natively over an inert
DOM, including supported SVG and MathML namespaces, URL handling, attribute
filtering and browser-compatible serialization. Event handlers, styling and
interactive form controls are removed according to that policy. Its output
passes 20 independent browser oracle cases and the two native browser tests.
These checks complement the strict corpus comparison and do not establish
complete sanitizer correctness.

The string API cannot observe browser Shadow DOM. `flattenShadowRoots` is
accepted to match the options shape; callers needing that behavior must flatten
an actual browser document before serializing it to this API. Parsing does not
execute JavaScript, download resources, or change the supplied input.
