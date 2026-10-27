package dom

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"strings"
	"testing"
)

func TestParserPreservesCommentCharacterReferences(t *testing.T) {
	input := `<p>&lt;jwz@example.org&gt;<!-- <a>&lt;jwz@example.org&gt; &amp;</a> --></p>`
	doc, err := html.Parse(strings.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	p := Find(doc, "p")
	if p.FirstChild.Data != "<jwz@example.org>" {
		t.Fatalf("normal entities: %q", p.FirstChild.Data)
	}
	comment := p.FirstChild.NextSibling
	if comment.Type != html.CommentNode || comment.Data != ` <a>&lt;jwz@example.org&gt; &amp;</a> ` {
		t.Fatalf("comment: %+v", comment)
	}
	if got := Inner(p); got != strings.TrimSuffix(strings.TrimPrefix(input, "<p>"), "</p>") {
		t.Fatalf("serialized: %s", got)
	}
}
func TestParserScriptingDisabledNoscript(t *testing.T) {
	doc, err := html.ParseWithOptions(strings.NewReader(`<body><noscript><img src="image.jpg"></noscript></body>`), html.ParseOptionEnableScripting(false))
	if err != nil {
		t.Fatal(err)
	}
	script := Find(doc, "noscript")
	if script == nil || script.FirstChild == nil || script.FirstChild.Type != html.ElementNode || script.FirstChild.Data != "img" {
		t.Fatalf("noscript markup not parsed: %+v", script)
	}
}
func TestParserForeignContentFosterParenting(t *testing.T) {
	doc, err := html.ParseWithOptions(strings.NewReader(`<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>"></table></mtext></math>`), html.ParseOptionEnableScripting(false))
	if err != nil {
		t.Fatal(err)
	}
	mtext := Find(doc, "mtext")
	glyph := mtext.FirstChild
	if mtext.Namespace != "math" || glyph.Data != "mglyph" || glyph.Namespace != "" || glyph.NextSibling.Data != "table" {
		t.Fatalf("foreign tree: %s", Inner(mtext))
	}
	img := Find(glyph, "img")
	if img == nil || Attr(img, "src") != "" || Attr(img, "title") != `--><img src=x onerror=alert(1)>` {
		t.Fatalf("foreign image: %+v", img)
	}
}
