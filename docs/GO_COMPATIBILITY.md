# Go native implementation: strict compatibility status

Evaluated on 2026-10-27. The native Go implementation passes the repository's
locked JavaScript extraction and readerability corpus. Runtime extraction uses
Go only: no JavaScript subprocess, JS virtual machine, CGO, network fetch or
precomputed fixture output. The npm backend remains JavaScript.

## Strict differential results

The extraction corpus contains 130 original upstream source pages plus 21
project fixtures, each through Chromium and Mozilla in both raw and public
layers: **604/604 cases pass, zero field/status/error differences**.

The independent readerability corpus passes **282/282 cases, zero differences**.
The sanitizer/semantic-cleanup audit separately processes the JavaScript raw
outputs through Go and matches all **290/290 successful raw/public pairs**.

Comparison remains exact: content HTML, text, UTF-16 length, all metadata,
missing-vs-null properties, error text, empty/error/ok state and input provenance.
No output normalization, allowed-difference list, expected-result lookup or
JavaScript reference replacement is used. The existing shared strict comparator
`scripts/rust-compatibility.mjs` is unchanged.

The first preview differed in 590 extraction cases. Fixes were made in the native
implementation, and successive full comparisons reduced differences to 294,
216, 26, 14 and finally zero. Final reports are regenerated from the JavaScript
bundle with the same script used by CI.

## Changes that closed the gaps

- Full candidate traversal, byline/title removal, scoring, ancestor promotion,
  sibling merging, four-stage flag fallback and best-attempt selection.
- Correct DIV/phrasing restructuring, BR paragraphs and FONT conversion order,
  noscript parsing/image replacement, lazy images, data tables, video exceptions
  and conditional cleanup.
- Chromium lead-image/caption/cite discovery, recipe behavior, single-child
  promotion, shopping/label/ad-break differences.
- Exact title/JSON-LD/meta precedence and entity decoding, fallback byline and
  article direction, excerpt whitespace, raw undefined/null output.
- Separate raw constructor coercion and public option validation; raw file URLs
  and fractional thresholds are not erroneously subjected to public validation.
- Browser-style serialization, UTF-16 scoring/length, ECMAScript whitespace,
  relative media/link handling, bare/hash fragments, URL host/trailing-slash rules.
- DOMPurify-derived HTML/SVG/MathML/attribute/URL policy plus portable semantic
  cleanup. Foreign namespaces are no longer unconditionally removed.
- Two documented bundled x/net/html parser fixes: retain formatting attribute insertion
  order and preserve literal entities inside comments. See
  [VENDOR_PATCHES.md](../go/VENDOR_PATCHES.md).

The JavaScript extraction engines, project fixtures and comparison pass/fail
rules were not changed. Targeted regression tests accompany the native fixes.

## Validation and reproducibility

Local environment: macOS arm64, Apple M5, Go 1.27.1, Node 26.11.1. Go 1.25 is the
module's declared minimum; the local run uses the coherent Homebrew installation
because the separate gvm installation has mismatched driver/compiler versions.

From go/:

```sh
go test ./...
go test -race ./...
go vet ./...
go test -run '^$' -fuzz FuzzExtractHTML -fuzztime=5s .
```

A bounded fuzz run executed 39,573 cases without failure. Race and vet
checks pass. An independent Go consumer module also passes extraction and parser
regressions, proving the corrections survive use as an imported dependency. These are local validations; Linux/Windows runtime jobs are
configured in `.github/workflows/go.yml` and are not claimed as locally executed.

From the repository root, with supported Node and locked JS dependencies:

```sh
bun install --frozen-lockfile
bun run build
node scripts/check-go-module.mjs
node scripts/go-compatibility.mjs
READABILITY_GO_COMPAT_BIN="$PWD/go-reports/readability-kit-compat" node scripts/check-go-sanitizer.mjs
```

`GO_BINARY` may select the Go toolchain. The comparison runner builds the native
candidate, captures the JavaScript reference, runs both extraction and readerability,
records Go source/module hashes and version in `go-provenance.json`, and exits
nonzero for any difference. Every candidate report includes its binary SHA-256.
The CI strict gate now blocks every run when either comparison fails; reports
are uploaded even on failure.

Generated files under ignored go-reports/ include javascript.json,
differences.json, readerable-javascript.json, readerable-differences.json and
go-provenance.json. Keep the JavaScript capture as reference, rather than
replacing it with Go output. The candidate JSON command is an offline adapter;
normal Go applications use the library or CLI without Node.

The final Chromium 156.0.8078.4 sanitizer run passed 20/20 checks with valid script
and event negative controls. The harness verifies actual native output under DOMParser,
live innerHTML and executing document parsing, with negative controls for script
and event execution. The browser test is separate from extraction parity; a
bounded adversarial suite is not a proof of safety for every HTML input.

## Scope and remaining boundaries

Passing this fixed corpus establishes the measured compatibility result, not
formal equivalence for every arbitrary document or JavaScript value. The URL
adapter starts from net/url; WHATWG edge cases not represented in tests can still
differ. Isolated UTF-16 surrogates and invalid UTF-8 have no promised reversible
mapping. Browser layout, live Shadow DOM and slot projection stay in the browser
adapter; the native library consumes static supplied HTML.

Limits.MaxInputBytes bounds Reader input; MaxNodes/MaxDepth validate the parsed
tree and do not bound parser allocations. Cancellation is cooperative and cannot
force a caller-owned blocking Reader to stop. Zero budgets remain unlimited.

No npm backend change, Go module publication or binary release was performed.
Cold-start and cross-language end-to-end performance acceptance, packaged-release
validation and a full dependency vulnerability scan are separate follow-up work.
