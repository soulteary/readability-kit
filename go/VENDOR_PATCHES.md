# Local HTML parser changes

Bundled parser source base: golang.org/x/net v0.55.0.
The separate atom dependency is now golang.org/x/net v0.58.0, pinned by
go.mod/go.sum; its atom sources are unchanged between these two versions.
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

## Backported upstream parser security fixes

The bundled copy does not acquire upstream fixes when only the separate atom
module requirement changes. Apply these exact Go Authors fixes to the v0.55.0
base while retaining the two DOM compatibility changes above:

- [GO-2026-6860](https://pkg.go.dev/vuln/GO-2026-6860), upstream
  [4af4fce62e93c5621a316363718b9dc78fbb0355](https://go.googlesource.com/net/+/4af4fce62e93c5621a316363718b9dc78fbb0355):
  accumulate coalesced parser text in byte buffers, then materialize node strings
  once parsing finishes, avoiding quadratic allocation/copying.
- [GO-2026-6866](https://pkg.go.dev/vuln/GO-2026-6866), upstream
  [3de643db506517b3e652a13cc0b56034cea6b8e6](https://go.googlesource.com/net/+/3de643db506517b3e652a13cc0b56034cea6b8e6):
  check the complete foreign-namespace ancestor chain in the retained upstream
  renderer. Extraction uses its own DOM serializer and default sanitization;
  this fix does not make unsanitized extraction output safe to render.

`internal/html/security_backport_test.go` retains the upstream Go Authors
regressions. Before the backports, the namespace cases fail and 10,000 coalesced
text tokens allocate over 50 MiB; afterwards the same tests require escaped
foreign raw text and at most 5 MiB for each coalescing workload. Keep these tests
and the full strict extraction/readerability corpus when refreshing this copy.

The Go module keeps Go 1.25 compatibility: x/net v0.59.0 and later require Go 1.26.
`govulncheck` sees the atom import but cannot associate this renamed bundled
parser with upstream advisories. A zero reachable-symbol result is therefore
not evidence that copied parser sources need no maintenance.
