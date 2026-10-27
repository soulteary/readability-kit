// SPDX-License-Identifier: Apache-2.0
package readability

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func benchmarkDocument(paragraphs int) string {
	paragraph := "<p>" + strings.Repeat("An investigation explains the evidence, compares the findings, and documents the conclusion. 中文与 emoji 🙂. ", 8) + `<a href="../evidence">Source evidence</a></p>`
	return "<html><head><title>Evidence investigation</title></head><body><nav>Home</nav><article>" + strings.Repeat(paragraph, paragraphs) + "</article></body></html>"
}

func BenchmarkExtractHTML(b *testing.B) {
	for _, engine := range []Engine{Chromium, Mozilla} {
		for _, size := range []int{4, 40} {
			for _, raw := range []bool{false, true} {
				b.Run(fmt.Sprintf("%s/paragraphs=%d/raw=%t", engine, size, raw), func(b *testing.B) {
					input := benchmarkDocument(size)
					options := ExtractOptions{URL: "https://example.com/articles/story", Engine: engine}
					extract := ExtractHTML
					if raw {
						extract = ExtractRawHTML
					}
					b.SetBytes(int64(len(input)))
					b.ReportAllocs()
					b.ResetTimer()
					for i := 0; i < b.N; i++ {
						article, err := extract(context.Background(), input, options)
						if err != nil || article == nil {
							b.Fatalf("article=%v error=%v", article, err)
						}
					}
				})
			}
		}
	}
}

func TestConcurrentExtractionSharedOptions(t *testing.T) {
	input := benchmarkDocument(4)
	keep := true
	for _, engine := range []Engine{Chromium, Mozilla} {
		options := ExtractOptions{URL: "https://example.com/story", Engine: engine, KeepClasses: &keep, ClassesToPreserve: []string{"article", "retained"}}
		before := append([]string(nil), options.ClassesToPreserve...)
		want, err := ExtractHTML(context.Background(), input, options)
		if err != nil || want == nil {
			t.Fatalf("baseline: %v", err)
		}
		var wg sync.WaitGroup
		for worker := 0; worker < 12; worker++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for i := 0; i < 8; i++ {
					got, err := ExtractHTML(context.Background(), input, options)
					if err != nil || !reflect.DeepEqual(got, want) {
						t.Errorf("concurrent extraction differs: %v", err)
						return
					}
				}
			}()
		}
		wg.Wait()
		if !reflect.DeepEqual(before, options.ClassesToPreserve) || !keep {
			t.Fatal("shared options mutated")
		}
	}
}

func FuzzExtractHTML(f *testing.F) {
	for _, seed := range []string{
		"", "<html><body>", "<article><p>中文🙂\x00\xff &amp; &#x1f642;</p></article>",
		`<svg><foreignObject><script>alert(1)</script></foreignObject></svg><p onclick="bad()"><a href="javascript:bad()">unsafe</a></p>`,
		`<table><p><div><p>malformed nesting</table><template shadowrootmode="open"><p>Shadow text</template>`,
		benchmarkDocument(2),
	} {
		f.Add(seed, false, false)
		f.Add(seed, true, true)
	}
	f.Fuzz(func(t *testing.T, input string, mozilla, raw bool) {
		if len(input) > 64*1024 {
			t.Skip()
		}
		engine := Chromium
		if mozilla {
			engine = Mozilla
		}
		options := ExtractOptions{URL: "https://example.com/story", Engine: engine, Limits: Limits{MaxInputBytes: 64 * 1024, MaxDepth: 100, MaxNodes: 4000}}
		extract := ExtractHTML
		if raw {
			extract = ExtractRawHTML
		}
		first, firstErr := extract(context.Background(), input, options)
		// An intervening request with unrelated text detects accidental state reuse.
		_, _ = extract(context.Background(), "<article><p>Unrelated request.</p></article>", options)
		second, secondErr := extract(context.Background(), input, options)
		if fmt.Sprint(firstErr) != fmt.Sprint(secondErr) || !reflect.DeepEqual(first, second) {
			t.Fatal("non-deterministic extraction or leaked request state")
		}
		if first != nil && first.Length != UTF16Len(first.TextContent) {
			t.Fatalf("length=%d UTF16=%d", first.Length, UTF16Len(first.TextContent))
		}
	})
}
