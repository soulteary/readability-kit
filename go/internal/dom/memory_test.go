package dom

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/soulteary/readability-kit/go/internal/html"
)

func TestCloneContextStructure(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<main id="root"><p>A<b>B</b>C</p><aside><img src="x"><i>D</i></aside></main>`))
	if err != nil {
		t.Fatal(err)
	}
	root := Find(doc, "main")
	copy, err := CloneContext(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if Outer(copy) != Outer(root) || copy.Parent != nil {
		t.Fatal("clone changed subtree")
	}
	Set(copy, "id", "copy")
	if Attr(root, "id") != "root" {
		t.Fatal("clone shares attribute storage")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CloneContext(ctx, root); err != context.Canceled {
		t.Fatalf("canceled clone: %v", err)
	}
	var want, got []*html.Node
	want = Elements(root)
	for n := range IterElements(root) {
		got = append(got, n)
	}
	if len(got) != len(want) {
		t.Fatal("iteration length")
	}
	for i := range want {
		if want[i] != got[i] {
			t.Fatal("iteration order")
		}
	}
	count := 0
	for range IterElements(root) {
		count++
		break
	}
	if count != 1 {
		t.Fatal("iteration does not stop")
	}
}

func BenchmarkElementTraversal(b *testing.B) {
	doc, err := html.Parse(strings.NewReader("<main>" + strings.Repeat("<div><p>Article text</p></div>", 1000) + "</main>"))
	if err != nil {
		b.Fatal(err)
	}
	b.Run("slice", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			for _, n := range Elements(doc) {
				if n.Type != html.ElementNode {
					b.Fatal("node")
				}
			}
		}
	})
	b.Run("iterator", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			for n := range IterElements(doc) {
				if n.Type != html.ElementNode {
					b.Fatal("node")
				}
			}
		}
	})
}

func BenchmarkCloneTraversal(b *testing.B) {
	doc, err := html.Parse(strings.NewReader("<main>" + strings.Repeat("<div><p>Article text</p></div>", 1000) + "</main>"))
	if err != nil {
		b.Fatal(err)
	}
	old := func(n *html.Node) *html.Node {
		shallow := func(n *html.Node) *html.Node {
			return &html.Node{Type: n.Type, Data: n.Data, DataAtom: n.DataAtom, Namespace: n.Namespace, Attr: append([]html.Attribute(nil), n.Attr...)}
		}
		x := shallow(n)
		type pair struct{ src, dst *html.Node }
		stack := []pair{{n, x}}
		for len(stack) > 0 {
			p := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			for c := p.src.FirstChild; c != nil; c = c.NextSibling {
				copy := shallow(c)
				p.dst.AppendChild(copy)
				stack = append(stack, pair{c, copy})
			}
		}
		return x
	}
	b.Run("stack", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = old(doc)
		}
	})
	b.Run("parent-links", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = Clone(doc)
		}
	})
}

func previousText(n *html.Node) string {
	var first string
	var out strings.Builder
	for x := n; x != nil; x = nextWithin(x, n) {
		if x.Type != html.TextNode || x.Data == "" {
			continue
		}
		if first == "" {
			first = x.Data
			continue
		}
		if out.Cap() == 0 {
			out.Grow(len(first) + len(x.Data))
			out.WriteString(first)
		}
		out.WriteString(x.Data)
	}
	if out.Cap() == 0 {
		return first
	}
	return out.String()
}

func BenchmarkAggregatePreallocation(b *testing.B) {
	for _, count := range []int{1, 10, 1000} {
		doc, err := html.Parse(strings.NewReader("<main>" + strings.Repeat(`<p class="article">Article text with 中文 and &amp; a few more words.</p>`, count) + "</main>"))
		if err != nil {
			b.Fatal(err)
		}
		root := Find(doc, "main")
		b.Run(fmt.Sprintf("text/%d/previous", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = previousText(root)
			}
		})
		b.Run(fmt.Sprintf("text/%d/reserved", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = Text(root)
			}
		})
		b.Run(fmt.Sprintf("inner/%d/previous", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				var out strings.Builder
				for c := root.FirstChild; c != nil; c = c.NextSibling {
					serialize(&out, c)
				}
				_ = out.String()
			}
		})
		b.Run(fmt.Sprintf("inner/%d/reserved", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = Inner(root)
			}
		})
		if Text(root) != previousText(root) {
			b.Fatal("text changed")
		}
		var out strings.Builder
		for c := root.FirstChild; c != nil; c = c.NextSibling {
			serialize(&out, c)
		}
		if Inner(root) != out.String() {
			b.Fatal("serialized content changed")
		}
	}
}
