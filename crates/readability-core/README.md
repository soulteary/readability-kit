# Native extraction core (experimental)

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
`Engine::Chromium` enables local Chromium adaptations. Neither mode promises
parity with the repository's pinned JavaScript engine. See the repository
compatibility report and vendored provenance for exact changes and known gaps.

The sanitizer uses ammonia with a conservative article tag allowlist, including
basic MathML, picture, audio and video. Interactive controls and styling are
removed. SVG and unsupported MathML remain outside this initial allowlist.
Unlike DOMPurify, `srcset` permits only absolute HTTP(S) candidates. This avoids
passing unchecked URL lists through ammonia's generic attribute handling.
Sanitizer differences are expected and require explicit review before adoption.

The string API cannot observe browser Shadow DOM. `flattenShadowRoots` is
accepted to match the options shape; callers needing that behavior must flatten
an actual browser document before serializing it to this API. Parsing does not
execute JavaScript, download resources, or change the supplied input.
