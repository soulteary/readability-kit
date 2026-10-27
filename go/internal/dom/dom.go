// Package dom supplies the small DOM surface used by the native extractor.
package dom

import (
	"context"
	"github.com/soulteary/readability-kit/go/internal/html"
	"iter"
	"strings"
)

func Attr(n *html.Node, k string) string {
	for _, a := range n.Attr {
		if a.Key == k {
			return a.Val
		}
	}
	return ""
}
func Set(n *html.Node, k, v string) {
	for i := range n.Attr {
		if n.Attr[i].Key == k {
			n.Attr[i].Val = v
			return
		}
	}
	n.Attr = append(n.Attr, html.Attribute{Key: k, Val: v})
}
func Text(n *html.Node) string {
	var first string
	total, count := 0, 0
	for x := n; x != nil; x = nextWithin(x, n) {
		if x.Type == html.TextNode && x.Data != "" {
			first = x.Data
			total += len(x.Data)
			count++
		}
	}
	if count < 2 {
		return first
	}
	var b strings.Builder
	b.Grow(total)
	for x := n; x != nil; x = nextWithin(x, n) {
		if x.Type == html.TextNode {
			b.WriteString(x.Data)
		}
	}
	return b.String()
}

// nextWithin walks a stable subtree without allocating a stack. Mutation-aware
// callers continue to use Walk, which snapshots siblings before each callback.
func nextWithin(n, root *html.Node) *html.Node {
	if n.FirstChild != nil {
		return n.FirstChild
	}
	for n != root {
		if n.NextSibling != nil {
			return n.NextSibling
		}
		n = n.Parent
	}
	return nil
}
func Length(s string) int {
	n := 0
	for _, r := range s {
		n++
		if r > 0xffff {
			n++
		}
	}
	return n
}
func NormalText(n *html.Node) string { return NormalizeSpace(Trim(Text(n))) }
func Walk(n *html.Node, f func(*html.Node)) {
	stack := []*html.Node{n}
	for len(stack) > 0 {
		x := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		f(x)
		for c := x.LastChild; c != nil; c = c.PrevSibling {
			stack = append(stack, c)
		}
	}

}
func Elements(n *html.Node) []*html.Node {
	var out []*html.Node
	Walk(n, func(x *html.Node) {
		if x.Type == html.ElementNode {
			out = append(out, x)
		}
	})
	return out
}

// IterElements visits a stable subtree in document order without materializing
// a slice of every element. Callers must not mutate the tree during iteration.
func IterElements(n *html.Node) iter.Seq[*html.Node] {
	return func(yield func(*html.Node) bool) {
		for x := n; x != nil; x = nextWithin(x, n) {
			if x.Type == html.ElementNode && !yield(x) {
				return
			}
		}
	}
}
func Find(n *html.Node, tag string) *html.Node {
	for x := n; x != nil; x = nextWithin(x, n) {
		if x.Type == html.ElementNode && x.Data == tag {
			return x
		}
	}
	return nil
}
func Remove(n *html.Node) {
	if n.Parent != nil {
		n.Parent.RemoveChild(n)
	}
}
func Clone(n *html.Node) *html.Node { x, _ := CloneContext(context.Background(), n); return x }
func CloneContext(ctx context.Context, n *html.Node) (*html.Node, error) {
	shallow := func(n *html.Node) *html.Node {
		return &html.Node{Type: n.Type, Data: n.Data, DataAtom: n.DataAtom, Namespace: n.Namespace, Attr: append([]html.Attribute(nil), n.Attr...)}
	}
	x := shallow(n)
	// Source and destination parent links provide the traversal stack. Unlike a
	// pending-sibling slice, this uses constant auxiliary space on wide trees.
	src, dst := n, x
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if src.FirstChild != nil {
			src = src.FirstChild
			child := shallow(src)
			dst.AppendChild(child)
			dst = child
			continue
		}
		for src != n && src.NextSibling == nil {
			src, dst = src.Parent, dst.Parent
		}
		if src == n {
			break
		}
		src = src.NextSibling
		child := shallow(src)
		dst.Parent.AppendChild(child)
		dst = child
	}
	return x, nil
}
func Visible(n *html.Node) bool {
	_, hidden := HasAttr(n, "hidden")
	style := strings.ToLower(strings.ReplaceAll(Attr(n, "style"), " ", ""))
	return !hidden && !strings.Contains(style, "display:none") && (Attr(n, "aria-hidden") != "true" || strings.Contains(Attr(n, "class"), "fallback-image"))
}
func HasAttr(n *html.Node, k string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == k {
			return a.Val, true
		}
	}
	return "", false
}
