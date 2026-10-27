// SPDX-License-Identifier: Apache-2.0
package engine

import (
	"context"
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
	"math"
	"strings"
	"testing"
)

func parseTest(t *testing.T, markup string) *html.Node {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestFragmentLinkDensity(t *testing.T) {
	for _, tc := range []struct {
		href string
		want float64
	}{{"#", 1}, {"#section", .3}, {"/other", 1}} {
		t.Run(tc.href, func(t *testing.T) {
			doc := parseTest(t, `<div><a href="`+tc.href+`">abcde</a></div>`)
			got := density(dom.Find(doc, "div"))
			if math.Abs(got-tc.want) > 1e-9 {
				t.Fatalf("link density=%g want %g", got, tc.want)
			}
		})
	}
}

func TestTitleHeaderPunctuation(t *testing.T) {
	title := "Evolve: Shared Mutable History"
	if got := similarity(title, title+"¶"); got != 1 {
		t.Fatalf("title with permalink punctuation similarity=%g", got)
	}
	doc := parseTest(t, `<article><h1>Evolve: Shared Mutable History<a href="#title">¶</a></h1><p>A substantive paragraph explains the article in sufficient detail for extraction.</p></article>`)
	out, err := Extract(context.Background(), doc, Options{Title: title, CharThreshold: 1})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(dom.Text(out), "¶") {
		t.Fatal("duplicate title with permalink remained")
	}
}

func TestBrReplacementBeforeFontConversion(t *testing.T) {
	doc := parseTest(t, `<div>before<br><br><font color="red">after</font></div>`)
	prepDocument(doc)
	div := dom.Find(doc, "div")
	children := elementChildren(div)
	if len(children) != 2 || children[0].Data != "p" || children[0].FirstChild != nil || children[1].Data != "span" {
		t.Fatalf("br replacement consumed font content before conversion: %s", dom.Inner(div))
	}
}

func TestHiddenVisibility(t *testing.T) {
	doc := parseTest(t, `<article><div style="visibility: hidden;"><p>Hidden paragraph contains sufficient words to otherwise qualify as the article body.</p></div><p>Visible paragraph has sufficient words and punctuation for reliable article selection.</p></article>`)
	out, err := Extract(context.Background(), doc, Options{CharThreshold: 1})
	if err != nil {
		t.Fatal(err)
	}
	if out == nil || strings.Contains(dom.Text(out), "Hidden paragraph") || !strings.Contains(dom.Text(out), "Visible paragraph") {
		t.Fatalf("unexpected visible article: %v", out)
	}
}

func TestBylineQualification(t *testing.T) {
	for _, tc := range []struct {
		name, attrs, text string
		want              bool
	}{
		{"ordinary", `class="article"`, "writer", false},
		{"class", `class="author"`, "writer", true},
		{"rel", `rel="author"`, "writer", true},
		{"itemprop", `itemprop="author creator"`, "writer", true},
		{"empty", `rel="author"`, " \t ", false},
		{"long", `class="author"`, strings.Repeat("x", 100), false},
		{"utf16", `rel="author"`, strings.Repeat("😀", 50), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			n := dom.Find(parseTest(t, `<div `+tc.attrs+`>`+tc.text+`</div>`), "div")
			if got := validByline(n, dom.Attr(n, "class")+" "+dom.Attr(n, "id")); got != tc.want {
				t.Fatalf("validByline = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestExtractOwnedMatchesPreservingEntry(t *testing.T) {
	markup := `<article><font color="red">Intro</font><div><br><br>A substantive paragraph contains enough detail, punctuation, and words for extraction.</div><script>discard()</script></article>`
	for _, engine := range []string{"chromium", "mozilla"} {
		for _, threshold := range []int{1, 10000} {
			doc := parseTest(t, markup)
			before := dom.Inner(doc)
			options := Options{Engine: engine, CharThreshold: threshold}
			preserved, err := Extract(context.Background(), doc, options)
			if err != nil {
				t.Fatal(err)
			}
			if got := dom.Inner(doc); got != before {
				t.Fatalf("%s/%d: Extract mutated its input", engine, threshold)
			}
			owned, err := ExtractOwned(context.Background(), parseTest(t, markup), options)
			if err != nil {
				t.Fatal(err)
			}
			if (preserved == nil) != (owned == nil) || preserved != nil && dom.Inner(preserved) != dom.Inner(owned) {
				t.Fatalf("%s/%d: entry points produced different content", engine, threshold)
			}
		}
	}
}
