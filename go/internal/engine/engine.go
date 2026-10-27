// SPDX-License-Identifier: Apache-2.0
// Package engine ports the pinned Mozilla and Chromium Readability traversal,
// candidate scoring, retries, and article cleanup to a native Go DOM.
// Upstream attribution and license details are recorded in go/NOTICE.
package engine

import (
	"context"
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
	"math"
	"regexp"
	"sort"
	"strings"
)

type Options struct {
	Engine                         string
	CharThreshold, NbTopCandidates int
	KeepClasses                    bool
	ClassesToPreserve              []string
	LinkDensityModifier            float64
	Title, Byline                  string
	Fields                         *Fields
}

type Fields struct{ Byline, Dir string }

var unlikely = compileLiteralMatcher(`(?i)-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|agegate|pagination|pager|popup|yom-remote`)
var positive = compileLiteralMatcher(`(?i)article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story`)
var negative = compileLiteralMatcher(`(?i)-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|widget`)
var recipe = compileLiteralMatcher(`(?i)recipe|ingredients|instructions|directions|steps`)
var maybe = compileLiteralMatcher(`(?i)and|article|body|column|content|main|mathjax|shadow`)
var shopping = compileLiteralMatcher(`(?i)shopping|shopper|retailer`)
var chromiumAdBreak = regexp.MustCompile(`(?i)(\b|_)ad-break`)

func Unlikely(s, engine string) bool {
	bad := unlikely.MatchString(s)
	good := maybe.MatchString(s)
	if engine == "chromium" {
		bad = bad || shopping.MatchString(s) || chromiumAdBreak.MatchString(s)
		good = good || recipe.MatchString(s)
	} else {
		bad = bad || strings.Contains(strings.ToLower(s), "ad-break")
	}
	return bad && !good
}
func Weight(n *html.Node, e string) float64 {
	v := 0.
	for _, s := range []string{dom.Attr(n, "class"), dom.Attr(n, "id")} {
		if negative.MatchString(s) {
			v -= 25
		}
		if positive.MatchString(s) || (e == "chromium" && recipe.MatchString(s)) {
			v += 25
		}
	}
	return v
}
func density(n *html.Node) float64 {
	return densityWithLength(n, dom.Length(dom.NormalText(n)))
}

func densityWithLength(n *html.Node, total int) float64 {
	if total == 0 {
		return 0
	}
	links := 0.
	dom.Walk(n, func(x *html.Node) {
		if x.Type == html.ElementNode && x.Data == "a" {
			l := float64(dom.Length(dom.NormalText(x)))
			if strings.HasPrefix(dom.Attr(x, "href"), "#") && len(dom.Attr(x, "href")) > 1 {
				l = l * .3
			}
			links += l
		}
	})
	return float64(links) / float64(total)
}
func initial(n *html.Node) float64 {
	s := 0.
	switch n.Data {
	case "div":
		s += 5
	case "pre", "td", "blockquote":
		s += 3
	case "address", "ol", "ul", "dl", "dd", "dt", "li", "form":
		s -= 3
	case "h1", "h2", "h3", "h4", "h5", "h6", "th":
		s -= 5
	}
	return s
}

// Extract preserves doc so callers may reuse the parsed input.
func Extract(ctx context.Context, doc *html.Node, o Options) (*html.Node, error) {
	return extract(ctx, dom.Clone(doc), o)
}

// ExtractOwned consumes the caller-owned doc and may mutate it. Callers must not
// reuse doc or its descendants after this call. It avoids the defensive clone
// needed by Extract; retry attempts still receive independent prepared trees.
func ExtractOwned(ctx context.Context, doc *html.Node, o Options) (*html.Node, error) {
	return extract(ctx, doc, o)
}

func extract(ctx context.Context, prepared *html.Node, o Options) (*html.Node, error) {
	prepDocument(prepared)
	var longest *html.Node
	longestLength := 0
	for attempt := 0; attempt < 4; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		work := prepared
		if attempt < 3 {
			work = dom.Clone(prepared)
		}
		body := dom.Find(work, "body")
		if body == nil {
			return nil, nil
		}
		scoreNodes := []*html.Node{}
		removedTitle := false
		byline := o.Byline != "" || o.Fields != nil && o.Fields.Byline != ""
		for n := dom.Find(work, "html"); n != nil; {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			next := nextElement(n, false)
			match := dom.Attr(n, "class") + " " + dom.Attr(n, "id")
			remove := !dom.Visible(n) || strings.Contains(strings.ReplaceAll(strings.ToLower(dom.Attr(n, "style")), " ", ""), "visibility:hidden") || (dom.Attr(n, "aria-modal") == "true" && dom.Attr(n, "role") == "dialog")
			if !byline && validByline(n, match) {
				byline = true
				if o.Fields != nil {
					by := n
					for _, c := range descendants(n) {
						if strings.Contains(dom.Attr(c, "itemprop"), "name") {
							by = c
							break
						}
					}
					o.Fields.Byline = strings.TrimSpace(dom.Text(by))
				}
				remove = true
			}
			if !removedTitle && (n.Data == "h1" || n.Data == "h2") && similarity(o.Title, strings.TrimSpace(dom.Text(n))) > .75 {
				removedTitle = true
				remove = true
			}
			if attempt == 0 && n.Data != "body" && n.Data != "a" && !ancestor(n, "table") && !ancestor(n, "code") && Unlikely(match, o.Engine) {
				remove = true
			}
			if attempt == 0 && in(dom.Attr(n, "role"), "menu menubar complementary navigation alert alertdialog dialog") {
				remove = true
			}
			if in(n.Data, "div section header h1 h2 h3 h4 h5 h6") && empty(n) {
				remove = true
			}
			if remove {
				next = nextElement(n, true)
				dom.Remove(n)
				n = next
				continue
			}
			if in(n.Data, "section h2 h3 h4 h5 h6 p td pre") {
				scoreNodes = append(scoreNodes, n)
			}
			if n.Data == "div" {
				wrapPhrasing(n)
				children := elementChildren(n)
				if single(n, "p") && density(n) < .25 {
					p := children[0]
					replace(n, p)
					n = p
					scoreNodes = append(scoreNodes, n)
				} else if !childBlock(n) {
					tag(n, "p")
					scoreNodes = append(scoreNodes, n)
				}
				next = nextElement(n, false)
			}
			n = next
		}
		scores := map[*html.Node]float64{}
		order := []*html.Node{}
		weight := func(n *html.Node) float64 {
			if attempt >= 2 {
				return 0
			}
			return Weight(n, o.Engine)
		}
		init := func(n *html.Node) {
			if _, ok := scores[n]; !ok {
				scores[n] = initial(n) + weight(n)
				order = append(order, n)
			}
		}
		for _, n := range scoreNodes {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if n.Parent == nil || n.Parent.Type != html.ElementNode {
				continue
			}
			t := dom.NormalText(n)
			l := dom.Length(t)
			if l < 25 {
				continue
			}
			commas := 0
			for _, r := range t {
				if strings.ContainsRune(",،﹐︐︑⹁⸴⸲，", r) {
					commas++
				}
			}
			score := 2 + float64(commas) + math.Min(math.Floor(float64(l)/100), 3)
			for p, level := n.Parent, 0; p != nil && level < 5; p, level = p.Parent, level+1 {
				if p.Type != html.ElementNode || p.Parent == nil || p.Parent.Type != html.ElementNode {
					continue
				}
				init(p)
				div := 1.
				if level == 1 {
					div = 2
				} else if level > 1 {
					div = float64(level * 3)
				}
				scores[p] += score / div
			}
		}
		for _, n := range order {
			scores[n] *= 1 - density(n)
		}
		sort.SliceStable(order, func(i, j int) bool { return scores[order[i]] > scores[order[j]] })
		count := o.NbTopCandidates
		if count < 1 {
			count = 5
		}
		if len(order) > count {
			order = order[:count]
		}
		var top *html.Node
		if len(order) > 0 {
			top = order[0]
		}
		created := top == nil || top == body
		if created {
			top = element("div")
			for body.FirstChild != nil {
				move(top, body.FirstChild)
			}
			body.AppendChild(top)
			init(top)
		} else {
			for p := top.Parent; p != nil && p != body; p = p.Parent {
				shared := 0
				for _, other := range order[1:] {
					if scores[other]/scores[top] >= .75 && isAncestor(p, other) {
						shared++
					}
				}
				if shared >= 3 {
					top = p
					break
				}
			}
			init(top)
			last := scores[top]
			threshold := last / 3
			for p := top.Parent; p != nil && p != body; p = p.Parent {
				score, ok := scores[p]
				if !ok {
					continue
				}
				if score < threshold {
					break
				}
				if score > last {
					top = p
					break
				}
				last = score
			}
			promotionThreshold := math.Max(10, scores[top]*.2)
			for top.Parent != nil && top.Parent != body {
				if o.Engine == "chromium" {
					significant := false
					for _, s := range elementChildren(top.Parent) {
						if s == top {
							continue
						}
						if scores[s] >= promotionThreshold || dom.Length(strings.TrimSpace(dom.Text(s))) > 25 {
							significant = true
							break
						}
					}
					if significant {
						break
					}
				} else if elementChildCount(top.Parent) != 1 {
					break
				}
				top = top.Parent
			}
			init(top)
		}
		parentOfTop := top.Parent
		out := element("div")
		if o.Engine == "chromium" {
			if figure := leadImage(top); figure != nil {
				out.AppendChild(figure)
			}
		}
		threshold := math.Max(10, scores[top]*.2)
		for _, s := range elementChildren(top.Parent) {
			include := s == top
			bonus := 0.
			if dom.Attr(s, "class") != "" && dom.Attr(s, "class") == dom.Attr(top, "class") {
				bonus = scores[top] * .2
			}
			if score, ok := scores[s]; ok && score+bonus >= threshold {
				include = true
			}
			if s.Data == "p" {
				l := dom.Length(dom.NormalText(s))
				d := density(s)
				if l > 80 && d < .25 || l < 80 && l > 0 && d == 0 && sentence.MatchString(dom.NormalText(s)) {
					include = true
				}
			}
			if include {
				if !in(s.Data, "div article section p ol ul") {
					tag(s, "div")
				}
				move(out, s)
			}
		}
		prepArticle(out, o, attempt < 3, weight)
		if created {
			dom.Set(top, "id", "readability-page-1")
			dom.Set(top, "class", "page")
		} else {
			page := element("div")
			dom.Set(page, "id", "readability-page-1")
			dom.Set(page, "class", "page")
			for out.FirstChild != nil {
				move(page, out.FirstChild)
			}
			out.AppendChild(page)
		}
		length := dom.Length(dom.NormalText(out))
		if length >= o.CharThreshold || attempt == 3 {
			if o.Fields != nil {
				ancestors := []*html.Node{parentOfTop, top}
				for p := parentOfTop.Parent; p != nil; p = p.Parent {
					ancestors = append(ancestors, p)
				}
				for _, p := range ancestors {
					if dir := dom.Attr(p, "dir"); dir != "" {
						o.Fields.Dir = dir
						break
					}
				}
			}
			if length < o.CharThreshold {
				if length > longestLength {
					return out, nil
				}
				return longest, nil
			}
			return out, nil
		}
		if length > longestLength {
			longest = out
			longestLength = length
		}
	}
	return longest, nil
}
func contains(a []string, s string) bool {
	for _, v := range a {
		if v == s {
			return true
		}
	}
	return false
}

var sentence = regexp.MustCompile(`\.( |$)`)
var bylineRE = compileLiteralMatcher(`(?i)byline|author|dateline|writtenby|p-author`)

func validByline(n *html.Node, s string) bool {
	// Attribute qualification is independent of text. Avoid constructing the
	// complete descendant text for every ordinary element in the traversal.
	if dom.Attr(n, "rel") != "author" && !strings.Contains(dom.Attr(n, "itemprop"), "author") && !bylineRE.MatchString(s) {
		return false
	}
	l := dom.Length(strings.TrimSpace(dom.Text(n)))
	return l > 0 && l < 100
}
func similarity(a, b string) float64 {
	aa := strings.FieldsFunc(strings.ToLower(a), func(r rune) bool { return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_') })
	bb := strings.FieldsFunc(strings.ToLower(b), func(r rune) bool { return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_') })
	if len(aa) == 0 || len(bb) == 0 {
		return 0
	}
	missing := []string{}
	for _, w := range bb {
		if !contains(aa, w) {
			missing = append(missing, w)
		}
	}
	return 1 - float64(len(strings.Join(missing, " ")))/float64(len(strings.Join(bb, " ")))
}
