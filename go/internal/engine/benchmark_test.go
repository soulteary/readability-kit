package engine

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/soulteary/readability-kit/go/internal/html"
)

// BenchmarkExtractCorpus isolates selection and cleanup from parsing and the
// public wrapper. These are the shared performance suite's size quantiles.
func BenchmarkExtractCorpus(b *testing.B) {
	for _, name := range []string{"rtl-4", "ehow-2", "schema-org-context-object"} {
		input, err := os.ReadFile("../../../vendor/mozilla/test/test-pages/" + name + "/source.html")
		if err != nil {
			b.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(string(input)))
		if err != nil {
			b.Fatal(err)
		}
		for _, engine := range []string{"chromium", "mozilla"} {
			b.Run(name+"/"+engine, func(b *testing.B) {
				b.ReportAllocs()
				for b.Loop() {
					if _, err := Extract(context.Background(), doc, Options{Engine: engine, CharThreshold: 500}); err != nil {
						b.Fatal(err)
					}
				}
			})
		}
	}
}
