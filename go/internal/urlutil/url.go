package urlutil

import (
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
	"net/url"
	"regexp"
	"strings"
)

var urlWhitespaceReplacer = strings.NewReplacer("\t", "", "\n", "", "\r", "")

func Resolve(base *url.URL, s string) string {
	value := strings.Trim(s, " \t\n\r\f")
	// WHATWG removes ASCII tabs and line breaks anywhere in URLs.
	value = urlWhitespaceReplacer.Replace(value)
	// A colon after non-ASCII text is not a valid scheme; net/url rejects the
	// relative path while URL resolves it. Escape those path bytes before parsing.
	u, e := url.Parse(value)
	if e != nil {
		colon := strings.IndexByte(value, ':')
		slash := strings.IndexAny(value, "/?#")
		if colon >= 0 && (slash < 0 || colon < slash) {
			prefix := value[:colon]
			valid := prefix != ""
			for i, r := range prefix {
				if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || i > 0 && (r >= '0' && r <= '9' || r == '+' || r == '-' || r == '.')) {
					valid = false
					break
				}
			}
			if !valid {
				u, e = url.Parse("./" + value)
			}
		}
	}
	if e != nil {
		return s
	}
	u = base.ResolveReference(u)
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	if (u.Scheme == "http" && u.Port() == "80") || (u.Scheme == "https" && u.Port() == "443") {
		u.Host = strings.TrimSuffix(u.Host, ":"+u.Port())
	}
	if (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.Path == "" {
		u.Path = "/"
	}
	if u.Scheme == "file" && len(u.Path) >= 3 && u.Path[0] == '/' && u.Path[2] == '|' {
		u.Path = u.Path[:2] + ":" + u.Path[3:]
		u.RawPath = ""
	}
	out := u.String()
	if strings.HasSuffix(value, "#") && !strings.HasSuffix(out, "#") {
		out += "#"
	}
	return out
}
func Base(doc *html.Node, source *url.URL) *url.URL {
	for n := range dom.IterElements(doc) {
		if _, ok := dom.HasAttr(n, "href"); n.Data == "base" && ok {
			u, e := url.Parse(dom.Attr(n, "href"))
			if e == nil {
				v := source.ResolveReference(u)
				if v.Scheme == "http" || v.Scheme == "https" {
					return v
				}
			}
			break
		}
	}
	return source
}

// Fix resolves links/media using the source as its own base (legacy helper).
func Fix(root *html.Node, base *url.URL) { FixWithSource(root, base, base) }

// FixWithSource follows the pinned engine postprocessing, including preserving
// document-local fragments and replacing javascript links without losing text.
func FixWithSource(root *html.Node, base, source *url.URL) {
	sameBase := base.String() == source.String()
	absolute := func(v string) string {
		if sameBase && strings.HasPrefix(v, "#") {
			return v
		}
		return Resolve(base, v)
	}
	// Keep a snapshot for links replaced below, but retain only URL-bearing
	// elements rather than every element in the article.
	var targets []*html.Node
	for n := range dom.IterElements(root) {
		switch n.Data {
		case "a", "img", "picture", "figure", "video", "audio", "source":
			targets = append(targets, n)
		}
	}
	for _, n := range targets {
		if n == root {
			continue
		}
		if n.Data == "a" {
			if href := dom.Attr(n, "href"); href != "" {
				if strings.HasPrefix(href, "javascript:") {
					if n.Parent == nil {
						continue
					}
					var replacement *html.Node
					if n.FirstChild != nil && n.FirstChild == n.LastChild && n.FirstChild.Type == html.TextNode {
						replacement = &html.Node{Type: html.TextNode, Data: dom.Text(n)}
					} else {
						replacement = &html.Node{Type: html.ElementNode, Data: "span"}
						for n.FirstChild != nil {
							c := n.FirstChild
							n.RemoveChild(c)
							replacement.AppendChild(c)
						}
					}
					n.Parent.InsertBefore(replacement, n)
					dom.Remove(n)
				} else {
					dom.Set(n, "href", absolute(href))
				}
			}
		}
		switch n.Data {
		case "img", "picture", "figure", "video", "audio", "source":
			for _, key := range []string{"src", "poster"} {
				if v := dom.Attr(n, key); v != "" {
					dom.Set(n, key, absolute(v))
				}
			}
			if v := dom.Attr(n, "srcset"); v != "" {
				dom.Set(n, "srcset", srcsetRE.ReplaceAllStringFunc(v, func(match string) string {
					parts := srcsetRE.FindStringSubmatch(match)
					return absolute(parts[1]) + parts[2] + parts[3]
				}))
			}
		}
	}
}

var srcsetRE = regexp.MustCompile(`(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))`)

// Scan URL tokens before descriptor tokens. A data URL's comma is part of the
// URL; only trailing URL commas or commas outside descriptor parentheses delimit.
func fixSrcset(base *url.URL, input string) string {
	space := func(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' }
	var candidates []string
	for pos := 0; pos < len(input); {
		for pos < len(input) && (space(input[pos]) || input[pos] == ',') {
			pos++
		}
		if pos == len(input) {
			break
		}
		start := pos
		for pos < len(input) && !space(input[pos]) {
			pos++
		}
		token := input[start:pos]
		if strings.HasSuffix(token, ",") {
			token = strings.TrimRight(token, ",")
			if token != "" {
				candidates = append(candidates, Resolve(base, token))
			}
			continue
		}
		for pos < len(input) && space(input[pos]) {
			pos++
		}
		start = pos
		depth := 0
		for pos < len(input) {
			c := input[pos]
			if c == '(' {
				depth++
			}
			if c == ')' && depth > 0 {
				depth--
			}
			if c == ',' && depth == 0 {
				break
			}
			pos++
		}
		descriptor := strings.TrimSpace(input[start:pos])
		candidate := Resolve(base, token)
		if descriptor != "" {
			candidate += " " + descriptor
		}
		candidates = append(candidates, candidate)
		if pos < len(input) {
			pos++
		}
	}
	return strings.Join(candidates, ", ")
}
