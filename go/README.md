# readability-kit for Go

Pure Go article extraction from supplied static HTML. The library and CLI do not
fetch pages or execute scripts. Native Chromium and Mozilla modes pass the
repository’s locked JavaScript
extraction and readerability corpus. Compatibility is measured for that corpus,
not promised for every possible HTML document. See [compatibility status](../docs/GO_COMPATIBILITY.md).

Requires Go 1.25 or later. From this directory:

```sh
go test ./...
go build -trimpath -o ../go-dist/readability-kit ./cmd/readability-kit
../go-dist/readability-kit article.html --url https://example.com/story
cat article.html | ../go-dist/readability-kit - --url https://example.com/story --format text
```

```go
import (
    "context"
    "fmt"
    readability "github.com/soulteary/readability-kit/go"
)

func printArticle(markup string) error {
    article, err := readability.ExtractHTML(context.Background(), markup,
        readability.ExtractOptions{URL: "https://example.com/story"})
    if err != nil { return err }
    if article != nil { fmt.Println(article.Title, article.TextContent) }
    return nil
}
```

`Extract` accepts an io.Reader; `IsProbablyReaderable` provides an advisory estimate.
No article returns `(nil, nil)`. Optional scalar fields in options use pointers
so an omitted default differs from explicit false/zero. The default sanitizer
ports the pinned DOMPurify article policy, including its
HTML/SVG/MathML namespace and attribute rules; styles, handlers, unsafe URL schemes
and interactive controls are removed. See SanitizerPolicy for the policy revision.
`Sanitize: &disabled` with `disabled := false` opts out; semantic cleanup still runs.
Article nullable metadata serializes as null, and Length counts UTF-16 code units.

Library calls own their DOM and may run concurrently. Context cancellation is
cooperative; blocking Reader calls and the underlying parser cannot be forcibly
interrupted. Limits.MaxInputBytes bounds reads; MaxDepth and MaxNodes validate the
parsed tree and do not bound parser allocations. Zero budgets are unlimited.

The CLI supports json/html/text, --engine, --output, stdin and files. Exit codes
are 0 success/help/version, 2 no article, 1 error. File replacement uses a temporary
file in the destination directory; failures preserve the existing output.

Run strict comparisons from the repository root after installing JS dependencies
and building dist:

```sh
node scripts/go-compatibility.mjs
```

It generates ignored go-reports/ snapshots and exits nonzero for any difference.
Bundled internal HTML parser compatibility patches are documented in [VENDOR_PATCHES.md](VENDOR_PATCHES.md).
The candidate command is only an offline test adapter. Runtime extraction needs
neither Node nor the adapter. Source attribution is in [NOTICE](NOTICE), the root
[NOTICE](../NOTICE) and [UPSTREAM.md](UPSTREAM.md). This module has not been published.

## Performance

The [shared benchmark report](../docs/PERFORMANCE.md) compares JavaScript, Go and Rust on the same locked corpus and protocol. See [Go optimization notes](../docs/GO_OPTIMIZATION.md) for the changes and strict validation. Previous measurements and raw evidence are retained.

The subsequent [memory and matching optimization](../docs/GO_MEMORY_OPTIMIZATION.md) retains the strict gate and includes reproducible allocation diagnostics.
