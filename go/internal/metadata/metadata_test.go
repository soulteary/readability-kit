package metadata

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"strings"
	"testing"
)

func TestMetadataPriority(t *testing.T) {
	doc, _ := html.Parse(strings.NewReader(`<title>Original document title</title><meta property="og:title" content="First"><meta property="og:title" content="Last"><meta name="dc.title" content="Dublin wins"><meta name="author" content="Second"><meta name="dc.creator" content="First">`))
	d := Read(doc, false)
	if d.Title != "Dublin wins" || d.Byline == nil || *d.Byline != "First" {
		t.Fatalf("metadata: %+v", d)
	}
}
func TestJSONLD(t *testing.T) {
	input := `<title>Unrelated original title</title><script type="application/ld+json">{"@type":"Article","name":"Missing context"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"Short","headline":"Much longer headline","author":[{"name":" A "},{"name":"B"}],"description":"A &amp;amp; B &nbsp;"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"Later article"}</script>`
	for engine, want := range map[string]string{"chromium": "Much longer headline", "mozilla": "Short"} {
		doc, _ := html.Parse(strings.NewReader(input))
		d := ReadWithEngine(doc, false, engine)
		if d.Title != want || d.Byline == nil || *d.Byline != "A, B" || d.Excerpt == nil || *d.Excerpt != "A &amp; B &nbsp;" {
			t.Fatalf("%s metadata: %+v", engine, d)
		}
	}
}
func TestTitleHierarchy(t *testing.T) {
	doc, _ := html.Parse(strings.NewReader(`<title>This is a full article title > A site name</title>`))
	if s := articleTitle(doc); s != "This is a full article title" {
		t.Fatal(s)
	}
}
