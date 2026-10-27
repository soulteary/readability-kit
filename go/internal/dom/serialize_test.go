package dom

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"strings"
	"testing"
)

func TestDOMSerialization(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<p title='a &amp; b " &lt;x&gt;'>It's &lt;code&gt; &amp; ` + "\u00a0" + `<br><img src="x"></p><svg viewBox="0 0 1 1"><path d="M1"></path></svg>`))
	if err != nil {
		t.Fatal(err)
	}
	got := Inner(Find(doc, "body"))
	want := `<p title="a &amp; b &quot; <x>">It's &lt;code&gt; &amp; &nbsp;<br><img src="x"></p><svg viewBox="0 0 1 1"><path d="M1"></path></svg>`
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}
func TestJSWhitespace(t *testing.T) {
	if Trim("\ufeff x \u0085") != "x \u0085" {
		t.Fatal("trim")
	}
	if NormalizeSpace("a\tb\n  c") != "a\tb c" {
		t.Fatal("normalize")
	}
}

func TestFormattingAttributeOrder(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<p><a target="_blank" href="https://example.test" data-kind="ref" rel="external">Reference</a><b title="t" id="i">bold</b></p>`))
	if err != nil {
		t.Fatal(err)
	}
	got := Inner(Find(doc, "body"))
	want := `<p><a target="_blank" href="https://example.test" data-kind="ref" rel="external">Reference</a><b title="t" id="i">bold</b></p>`
	if got != want {
		t.Fatalf("attribute insertion order changed: %s", got)
	}
}
