// SPDX-License-Identifier: Apache-2.0
package engine

import (
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
	"golang.org/x/net/html/atom"
	"strings"
)

// in checks whole space-delimited names without allocating padded strings.
func in(s, list string) bool {
	for start := 0; start <= len(list); {
		end := strings.IndexByte(list[start:], ' ')
		if end < 0 {
			return list[start:] == s
		}
		end += start
		if list[start:end] == s {
			return true
		}
		start = end + 1
	}
	return false
}
func element(s string) *html.Node {
	return &html.Node{Type: html.ElementNode, Data: s, DataAtom: atom.Lookup([]byte(s))}
}
func tag(n *html.Node, s string) { n.Data = s; n.DataAtom = atom.Lookup([]byte(s)) }
func move(p, n *html.Node)       { dom.Remove(n); p.AppendChild(n) }
func replace(old, n *html.Node) {
	p := old.Parent
	if p == nil {
		return
	}
	dom.Remove(n)
	p.InsertBefore(n, old)
	p.RemoveChild(old)
}
func elementChildren(n *html.Node) []*html.Node {
	var r []*html.Node
	if n != nil {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode {
				r = append(r, c)
			}
		}
	}
	return r
}
func nextElement(n *html.Node, skip bool) *html.Node {
	if !skip {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode {
				return c
			}
		}
	}
	for n != nil {
		for c := n.NextSibling; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode {
				return c
			}
		}
		n = n.Parent
	}
	return nil
}
func ancestor(n *html.Node, s string) bool {
	for p, i := n.Parent, 0; p != nil && i <= 3; p, i = p.Parent, i+1 {
		if p.Data == s {
			return true
		}
	}
	return false
}
func isAncestor(p, n *html.Node) bool {
	for n = n.Parent; n != nil; n = n.Parent {
		if n == p {
			return true
		}
	}
	return false
}
func firstElementChild(n *html.Node) *html.Node {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode {
			return c
		}
	}
	return nil
}

func elementChildCount(n *html.Node) int {
	count := 0
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode {
			count++
		}
	}
	return count
}

func single(n *html.Node, s string) bool {
	found := false
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode {
			if found || c.Data != s {
				return false
			}
			found = true
		} else if c.Type == html.TextNode && strings.TrimSpace(c.Data) != "" {
			return false
		}
	}
	return found
}

func empty(n *html.Node) bool {
	if strings.TrimSpace(dom.Text(n)) != "" {
		return false
	}
	cs := elementChildren(n)
	br := 0
	for _, c := range descendants(n) {
		if in(c.Data, "br hr") {
			br++
		}
	}
	return len(cs) == 0 || len(cs) == br
}
func descendants(n *html.Node) []*html.Node {
	all := dom.Elements(n)
	if len(all) > 0 {
		return all[1:]
	}
	return nil
}

// descendantsWithTags retains snapshot traversal order for mutating passes,
// without retaining every unrelated element in the article.
func descendantsWithTags(n *html.Node, tags string) []*html.Node {
	var nodes []*html.Node
	dom.Walk(n, func(x *html.Node) {
		if x != n && x.Type == html.ElementNode && in(x.Data, tags) {
			nodes = append(nodes, x)
		}
	})
	return nodes
}

func phrasing(n *html.Node) bool {
	if n.Type == html.TextNode {
		return true
	}
	if in(n.Data, "abbr audio b bdo br button cite code data datalist dfn em embed i img input kbd label mark math meter noscript object output progress q ruby samp script select small span strong sub sup textarea time var wbr") {
		return true
	}
	if in(n.Data, "a del ins") {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if !phrasing(c) {
				return false
			}
		}
		return true
	}
	return false
}
func whitespace(n *html.Node) bool {
	return n.Data == "br" || n.Type == html.TextNode && strings.TrimSpace(n.Data) == ""
}
func childBlock(n *html.Node) bool {
	for _, c := range descendants(n) {
		if in(c.Data, "blockquote dl div img ol p pre table ul") {
			return true
		}
	}
	return false
}
func wrapPhrasing(n *html.Node) {
	for c := n.FirstChild; c != nil; {
		next := c.NextSibling
		if phrasing(c) {
			var run []*html.Node
			for c != nil && phrasing(c) {
				run = append(run, c)
				c = c.NextSibling
			}
			next = c
			for len(run) > 0 && whitespace(run[0]) {
				dom.Remove(run[0])
				run = run[1:]
			}
			for len(run) > 0 && whitespace(run[len(run)-1]) {
				dom.Remove(run[len(run)-1])
				run = run[:len(run)-1]
			}
			if len(run) > 0 {
				p := element("p")
				n.InsertBefore(p, next)
				for _, r := range run {
					move(p, r)
				}
			}
		}
		c = next
	}
}
func nextNonSpace(n *html.Node) *html.Node {
	for n != nil && n.Type != html.ElementNode && strings.TrimSpace(dom.Text(n)) == "" {
		n = n.NextSibling
	}
	return n
}
func prepDocument(doc *html.Node) {
	unwrapNoscript(doc)
	for _, n := range dom.Elements(doc) {
		if in(n.Data, "script noscript style") {
			dom.Remove(n)
		}
	}
	body := dom.Find(doc, "body")
	if body == nil {
		return
	}
	for _, br := range descendants(body) {
		if br.Data != "br" || br.Parent == nil {
			continue
		}
		next := br.NextSibling
		replaced := false
		for {
			next = nextNonSpace(next)
			if next == nil || next.Data != "br" {
				break
			}
			replaced = true
			s := next.NextSibling
			dom.Remove(next)
			next = s
		}
		if !replaced {
			continue
		}
		p := element("p")
		replace(br, p)
		for next = p.NextSibling; next != nil; {
			if next.Data == "br" {
				nn := nextNonSpace(next.NextSibling)
				if nn != nil && nn.Data == "br" {
					break
				}
			}
			if !phrasing(next) {
				break
			}
			s := next.NextSibling
			move(p, next)
			next = s
		}
		for p.LastChild != nil && whitespace(p.LastChild) {
			dom.Remove(p.LastChild)
		}
		if p.Parent != nil && p.Parent.Data == "p" {
			tag(p.Parent, "div")
		}
	}
	for _, n := range dom.Elements(doc) {
		if n.Data == "font" {
			tag(n, "span")
		}
	}
}

// PostProcess performs Readability's final DOM simplification and class filtering.
// Call it after relative URI processing, before serialization.
func PostProcess(root *html.Node, o Options) {
	for n := root; n != nil; {
		if n.Parent != nil && in(n.Data, "div section") && !strings.HasPrefix(dom.Attr(n, "id"), "readability") {
			if empty(n) {
				next := nextElement(n, true)
				dom.Remove(n)
				n = next
				continue
			}
			if single(n, "div") || single(n, "section") {
				child := firstElementChild(n)
				for _, a := range n.Attr {
					dom.Set(child, a.Key, a.Val)
				}
				replace(n, child)
				n = child
				continue
			}
		}
		n = nextElement(n, false)
	}
	if !o.KeepClasses {
		for _, n := range dom.Elements(root) {
			classes := []string{}
			for _, c := range strings.Fields(dom.Attr(n, "class")) {
				if c == "page" || contains(o.ClassesToPreserve, c) {
					classes = append(classes, c)
				}
			}
			if len(classes) > 0 {
				dom.Set(n, "class", strings.Join(classes, " "))
			} else {
				removeAttr(n, "class")
			}
		}
	}
}

func singleImage(n *html.Node) bool {
	for n != nil {
		if n.Data == "img" {
			return true
		}
		cs := elementChildren(n)
		if len(cs) != 1 || strings.TrimSpace(dom.Text(n)) != "" {
			return false
		}
		n = cs[0]
	}
	return false
}
func unwrapNoscript(doc *html.Node) {
	for _, img := range descendants(doc) {
		if img.Data != "img" {
			continue
		}
		keep := false
		for _, a := range img.Attr {
			if in(a.Key, "src srcset data-src data-srcset") || imageExt.MatchString(a.Val) {
				keep = true
				break
			}
		}
		if !keep {
			dom.Remove(img)
		}
	}
	for _, n := range descendants(doc) {
		if n.Data != "noscript" || !singleImage(n) {
			continue
		}
		prev := n.PrevSibling
		for prev != nil && prev.Type != html.ElementNode {
			prev = prev.PrevSibling
		}
		if prev == nil || !singleImage(prev) {
			continue
		}
		old := prev
		if old.Data != "img" {
			old = dom.Find(prev, "img")
		}
		copy := dom.Clone(firstElementChild(n))
		img := copy
		if img.Data != "img" {
			img = dom.Find(copy, "img")
		}
		for _, a := range old.Attr {
			if a.Val != "" && (in(a.Key, "src srcset") || imageExt.MatchString(a.Val)) {
				if dom.Attr(img, a.Key) == a.Val {
					continue
				}
				key := a.Key
				if _, ok := dom.HasAttr(img, key); ok {
					key = "data-old-" + key
				}
				dom.Set(img, key, a.Val)
			}
		}
		replace(prev, copy)
	}
}
