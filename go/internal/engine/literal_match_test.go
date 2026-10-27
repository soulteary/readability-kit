// SPDX-License-Identifier: Apache-2.0
package engine

import (
	"context"
	"math/rand"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/soulteary/readability-kit/go/internal/html"
)

func TestLiteralMatchersEqualRegexp(t *testing.T) {
	matchers := []*literalMatcher{unlikely, positive, negative, recipe, maybe, shopping, bylineRE}
	inputs := []string{"", "hid", "HID", " hid", "hid ", "x hid y", "hidx", "hidden", "AUTHOR", "articleſ", "ſidebar", "ſHOPPING", "sKyscraper", "a\xffauthor", "author\xff", "author\n", "hid\n", "\nhid", "hidden中文", "中文author"}
	random := rand.New(rand.NewSource(20261027))
	for i := 0; i < 30000; i++ {
		bytes := make([]byte, random.Intn(100))
		for j := range bytes {
			bytes[j] = byte(random.Intn(128))
		}
		inputs = append(inputs, string(bytes))
	}
	for _, matcher := range matchers {
		if matcher.transitions == nil {
			t.Fatalf("expected literal fast path: %s", matcher.original)
		}
		reference := regexp.MustCompile(matcher.original.String())
		for _, s := range inputs {
			if got, want := matcher.MatchString(s), reference.MatchString(s); got != want {
				t.Fatalf("%s input %q: got %t want %t", matcher.original, s, got, want)
			}
		}
		for _, alternative := range strings.Split(strings.TrimPrefix(matcher.original.String(), "(?i)"), "|") {
			literal := strings.Trim(alternative, "^$")
			for _, s := range []string{literal, strings.ToUpper(literal), "x" + literal, literal + "x", "x " + literal + " y", literal + "ſ", "K" + literal, literal + "\n"} {
				if got, want := matcher.MatchString(s), reference.MatchString(s); got != want {
					t.Fatalf("%s input %q: got %t want %t", matcher.original, s, got, want)
				}
			}
		}
	}
	for _, pattern := range []string{`(?i)foo.*bar`, `(?i)\bfoo`, `foo`, `(?i)(foo|bar)`, `(?i)foo|`, `(?i)é`} {
		matcher := compileLiteralMatcher(pattern)
		if matcher.transitions != nil {
			t.Fatalf("unsupported pattern used fast path: %s", pattern)
		}
		for _, s := range inputs[:100] {
			if matcher.MatchString(s) != matcher.original.MatchString(s) {
				t.Fatalf("fallback mismatch: %s", pattern)
			}
		}
	}
}

func BenchmarkExtractLiteralStrategy(b *testing.B) {
	matchers := []*literalMatcher{unlikely, positive, negative, recipe, maybe, shopping, bylineRE}
	saved := make([][][128]uint16, len(matchers))
	for i, m := range matchers {
		saved[i] = m.transitions
	}
	defer func() {
		for i, m := range matchers {
			m.transitions = saved[i]
		}
	}()
	for _, strategy := range []string{"regexp", "literal"} {
		for i, m := range matchers {
			if strategy == "regexp" {
				m.transitions = nil
			} else {
				m.transitions = saved[i]
			}
		}
		for _, name := range []string{"rtl-4", "ehow-2", "schema-org-context-object"} {
			data, err := os.ReadFile("../../../vendor/mozilla/test/test-pages/" + name + "/source.html")
			if err != nil {
				b.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(string(data)))
			if err != nil {
				b.Fatal(err)
			}
			for _, engine := range []string{"chromium", "mozilla"} {
				b.Run(strategy+"/"+name+"/"+engine, func(b *testing.B) {
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
}
