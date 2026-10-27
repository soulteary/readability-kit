// SPDX-License-Identifier: Apache-2.0
package engine

import (
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
	"regexp"
	"strconv"
	"strings"
)

var video = regexp.MustCompile(`(?i)//(?:www\.)?(?:dailymotion\.com|youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|vimeo\.com|v\.qq\.com|archive\.org|upload\.wikimedia\.org)`)
var adWords = regexp.MustCompile(`(?i)^(ad(vertising|vertisement)?|pub(licité)?|werb(ung)?|广告|Реклама|Anuncio)$`)
var loadingWords = regexp.MustCompile(`(?i)^((loading|正在加载|Загрузка|chargement|cargando)(…|\.\.\.)?)$`)
var share = regexp.MustCompile(`(?i)(\b|_)(share|sharedaddy)(\b|_)`)

func removeAttr(n *html.Node, key string) {
	a := n.Attr[:0]
	for _, v := range n.Attr {
		if v.Key != key {
			a = append(a, v)
		}
	}
	clear(n.Attr[len(a):])
	n.Attr = a
}
func counts(n *html.Node, tags string) int {
	c := 0
	dom.Walk(n, func(x *html.Node) {
		if x != n && x.Type == html.ElementNode && in(x.Data, tags) {
			c++
		}
	})
	return c
}
func textDensity(n *html.Node, tags string) float64 {
	return textDensityWithLength(n, tags, dom.Length(dom.NormalText(n)))
}

func textDensityWithLength(n *html.Node, tags string, l int) float64 {
	if l == 0 {
		return 0
	}
	sum := 0
	dom.Walk(n, func(x *html.Node) {
		if x != n && x.Type == html.ElementNode && in(x.Data, tags) {
			sum += dom.Length(dom.NormalText(x))
		}
	})
	return float64(sum) / float64(l)
}
func allowed(n *html.Node) bool {
	for _, a := range n.Attr {
		if video.MatchString(a.Val) {
			return true
		}
	}
	return n.Data == "object" && video.MatchString(dom.Inner(n))
}
func prepArticle(root *html.Node, o Options, conditional bool, weight func(*html.Node) float64) {
	dom.Walk(root, func(n *html.Node) {
		if n.Type != html.ElementNode || n.Data == "svg" {
			return
		}
		attrs := n.Attr[:0]
		for _, a := range n.Attr {
			if !in(a.Key, "align background bgcolor border cellpadding cellspacing frame hspace rules style valign vspace") && !(in(n.Data, "table th td hr pre") && in(a.Key, "width height")) {
				attrs = append(attrs, a)
			}
		}
		clear(n.Attr[len(attrs):])
		n.Attr = attrs
	})
	tables := map[*html.Node]bool{}
	for _, t := range descendants(root) {
		if t.Data != "table" {
			continue
		}
		if dom.Attr(t, "role") == "presentation" || dom.Attr(t, "datatable") == "0" {
			continue
		}
		data := dom.Attr(t, "summary") != "" || counts(t, "col colgroup tfoot thead th") > 0
		c := dom.Find(t, "caption")
		data = data || c != nil && c.FirstChild != nil
		if !data && counts(t, "table") == 0 {
			rows, cols := 0, 0
			for _, r := range descendants(t) {
				if r.Data != "tr" {
					continue
				}
				span, _ := strconv.Atoi(dom.Attr(r, "rowspan"))
				if span == 0 {
					span = 1
				}
				rows += span
				col := 0
				for _, c := range descendants(r) {
					if c.Data == "td" {
						span, _ := strconv.Atoi(dom.Attr(c, "colspan"))
						if span == 0 {
							span = 1
						}
						col += span
					}
				}
				if col > cols {
					cols = col
				}
			}
			data = cols != 1 && rows != 1 && (rows >= 10 || cols > 4 || rows*cols > 10)
		}
		tables[t] = data
	}
	fixLazy(root)
	cleanConditionally := func(tagName string) {
		if !conditional {
			return
		}
		nodes := descendantsWithTags(root, tagName)
		for i := len(nodes) - 1; i >= 0; i-- {
			n := nodes[i]
			if n.Data != tagName || n.Parent == nil {
				continue
			}
			protected := tables[n]
			for p := n.Parent; p != nil; p = p.Parent {
				if tables[p] {
					protected = true
				}
			}
			children := descendants(n)
			for _, t := range children {
				if tables[t] {
					protected = true
				}
			}
			if protected || ancestor(n, "code") {
				continue
			}
			w := weight(n)
			remove := w < 0
			if !remove && strings.Count(dom.Text(n), ",") < 10 {
				list := in(tagName, "ul ol")
				listLength := 0
				for _, l := range children {
					if in(l.Data, "ul ol") {
						listLength += dom.Length(dom.NormalText(l))
					}
				}
				normal := dom.NormalText(n)
				length := dom.Length(normal)
				if length > 0 && float64(listLength)/float64(length) > .9 {
					list = true
				}
				p, img, li, input := 0, 0, -100, 0
				for _, child := range children {
					switch child.Data {
					case "p":
						p++
					case "img":
						img++
					case "li":
						li++
					case "input":
						input++
					}
				}
				embed := 0
				protected = false
				for _, e := range children {
					if in(e.Data, "object embed iframe") {
						if allowed(e) {
							protected = true
							break
						}
						embed++
					}
				}
				if protected {
					continue
				}
				d := densityWithLength(n, length)
				figure := ancestor(n, "figure")
				heading := textDensityWithLength(n, "h1 h2 h3 h4 h5 h6", length)
				td := textDensityWithLength(n, "span li td blockquote dl div img ol p pre table ul", length)
				text := strings.ToLower(normal)
				ads := adWords.MatchString(text) || loadingWords.MatchString(text)
				remove = ads || !figure && img > 1 && float64(p)/float64(img) < .5 || !list && li > p || input > p/3 || !list && !figure && heading < .9 && length < 25 && (img == 0 || img > 2) && d > 0 || !list && w < 25 && d > .2+o.LinkDensityModifier || w >= 25 && d > .5+o.LinkDensityModifier || embed == 1 && length < 75 || embed > 1 || img == 0 && td == 0
				if list && remove {
					simple := true
					for _, c := range elementChildren(n) {
						if elementChildCount(c) > 1 {
							simple = false
						}
					}
					if simple && img == li+100 {
						remove = false
					}
				}
			}
			if remove {
				dom.Remove(n)
			}
		}
	}
	cleanConditionally("form")
	cleanConditionally("fieldset")
	for _, n := range descendants(root) {
		if in(n.Data, "object embed footer link aside") && (!in(n.Data, "object embed") || !allowed(n)) {
			dom.Remove(n)
		}
	}
	for _, top := range elementChildren(root) {
		for _, n := range descendants(top) {
			if share.MatchString(dom.Attr(n, "class")+" "+dom.Attr(n, "id")) && dom.Length(dom.Text(n)) < 500 {
				dom.Remove(n)
			}
		}
	}
	for _, n := range descendants(root) {
		if in(n.Data, "iframe input textarea select button") && (n.Data != "iframe" || !allowed(n)) {
			dom.Remove(n)
		}
		if in(n.Data, "h1 h2") && weight(n) < 0 {
			dom.Remove(n)
		}
	}
	cleanConditionally("table")
	cleanConditionally("ul")
	cleanConditionally("div")
	if o.Engine == "chromium" {
		cleanConditionally("label")
	}
	for _, n := range descendants(root) {
		if n.Data == "h1" {
			tag(n, "h2")
		}
		if n.Data == "p" && counts(n, "img embed object iframe") == 0 && strings.TrimSpace(dom.Text(n)) == "" {
			dom.Remove(n)
		}
		if n.Data == "br" {
			next := nextNonSpace(n.NextSibling)
			if next != nil && next.Data == "p" {
				dom.Remove(n)
			}
		}
		if n.Data == "table" && n.Parent != nil {
			body := n
			if single(n, "tbody") {
				body = firstElementChild(n)
			}
			if single(body, "tr") {
				row := firstElementChild(body)
				if single(row, "td") {
					cell := firstElementChild(row)
					ph := true
					for c := cell.FirstChild; c != nil; c = c.NextSibling {
						if !phrasing(c) {
							ph = false
						}
					}
					if ph {
						tag(cell, "p")
					} else {
						tag(cell, "div")
					}
					replace(n, cell)
				}
			}
		}
	}
}

var imageExt = regexp.MustCompile(`(?i)\.(jpg|jpeg|png|webp)`)
var imageSet = regexp.MustCompile(`\.(jpg|jpeg|png|webp)\s+\d`)
var imageSrc = regexp.MustCompile(`^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$`)

func fixLazy(root *html.Node) {
	for _, n := range descendantsWithTags(root, "img picture figure") {
		src := dom.Attr(n, "src")
		if strings.HasPrefix(src, "data:") && strings.Contains(src, ";base64,") {
			if strings.HasPrefix(src, "data:image/svg+xml") {
				continue
			}
			candidate := false
			for _, a := range n.Attr {
				if a.Key != "src" && imageExt.MatchString(a.Val) {
					candidate = true
				}
			}
			if candidate && len(strings.SplitN(src, ",", 2)[1]) < 133 {
				removeAttr(n, "src")
			}
		}
		if (dom.Attr(n, "src") != "" || dom.Attr(n, "srcset") != "" && dom.Attr(n, "srcset") != "null") && !strings.Contains(strings.ToLower(dom.Attr(n, "class")), "lazy") {
			continue
		}
		for _, a := range append([]html.Attribute(nil), n.Attr...) {
			if in(a.Key, "src srcset alt") {
				continue
			}
			target := ""
			if imageSet.MatchString(a.Val) {
				target = "srcset"
			} else if imageSrc.MatchString(a.Val) {
				target = "src"
			}
			if target != "" {
				if n.Data != "figure" {
					dom.Set(n, target, a.Val)
				} else if counts(n, "img picture") == 0 {
					img := element("img")
					dom.Set(img, target, a.Val)
					n.AppendChild(img)
				}
			}
		}
	}
}
