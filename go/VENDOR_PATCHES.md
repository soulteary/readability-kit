# Local HTML parser changes

Base: golang.org/x/net v0.55.0, pinned by go.mod/go.sum.
The HTML parser sources are retained under internal/html with upstream copyright,
LICENSE and PATENTS; atom remains an ordinary x/net dependency. This internal
package ensures consumers of the module receive the patches: Go ignores a
dependency module’s vendor directory. No replace directive or consumer action is
required.

## Preserve formatting element attribute order

internal/html/parse.go addFormattingElement previously sorted the token attribute slice
and the resulting DOM node's attributes to optimize Noah's Ark comparisons.
Browsers preserve the original insertion order in DOM serialization. Sort copies
for equivalence checks instead, retaining the original DOM attribute slice order.
This changes serialization, not the order-insensitive formatting-element identity
checks or HTML tokenization. Updating the internal parser requires reapplying this patch. Regression: internal/dom tests and complete strict corpus.

## Preserve character references inside HTML comments

internal/html/token.go Tokenizer.Text previously decoded character references in comment
content. HTML comments treat ampersands literally, and browser DOM serialization
preserves those references. Skip entity decoding for CommentToken while retaining
newline and null replacement. Regression: internal/dom/parse_test.go tests both
comment text and serialized output alongside normal text entity decoding.
