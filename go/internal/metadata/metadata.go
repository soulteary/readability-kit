package metadata

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
)

type Data struct {
	Title                                               string
	Byline, Dir, Lang, Excerpt, SiteName, PublishedTime *string
}

func Ptr(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

var ws = regexp.MustCompile(`[\s\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+`)

func trim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return unicode.IsSpace(r) || r == '\ufeff' })
}

var titleWhitespace = regexp.MustCompile(`[\t\n\f\r ]+`)

var sep = regexp.MustCompile(`\s[|\-–—\\/>»]\s`)
var hierarchy = regexp.MustCompile(`\s[\\/>»]\s`)
var leadingSep = regexp.MustCompile(`^[^|\-–—\\/>»]*[|\-–—\\/>»]`)

func words(s string) int { return len(ws.Split(s, -1)) }
func documentTitle(doc *html.Node) string {
	if n := dom.Find(doc, "title"); n != nil {
		return trim(titleWhitespace.ReplaceAllString(dom.Text(n), " "))
	}
	return ""
}
func articleTitle(doc *html.Node) string {
	orig := documentTitle(doc)
	cur := orig
	hierarchical := false
	if matches := sep.FindAllStringIndex(cur, -1); len(matches) > 0 {
		hierarchical = hierarchy.MatchString(cur)
		cur = orig[:matches[len(matches)-1][0]]
		if words(cur) < 3 {
			cur = leadingSep.ReplaceAllString(orig, "")
		}
	} else if strings.Contains(cur, ": ") {
		match := false
		for n := range dom.IterElements(doc) {
			if (n.Data == "h1" || n.Data == "h2") && trim(dom.Text(n)) == trim(cur) {
				match = true
				break
			}
		}
		if !match {
			cur = orig[strings.LastIndex(orig, ":")+1:]
			if words(cur) < 3 {
				cur = orig[strings.Index(orig, ":")+1:]
			} else if words(orig[:strings.Index(orig, ":")]) > 5 {
				cur = orig
			}
		}
	} else if dom.Length(cur) > 150 || dom.Length(cur) < 15 {
		var h []*html.Node
		for n := range dom.IterElements(doc) {
			if n.Data == "h1" {
				h = append(h, n)
			}
		}
		if len(h) == 1 {
			cur = ws.ReplaceAllString(trim(dom.Text(h[0])), " ")
		}
	}
	cur = ws.ReplaceAllString(trim(cur), " ")
	count := words(cur)
	if count <= 4 && (!hierarchical || count != words(sep.ReplaceAllString(orig, ""))-1) {
		cur = orig
	}
	return cur
}

var propertyPattern = regexp.MustCompile(`(?i)\s*(article|dc|dcterm|og|twitter)\s*:\s*(author|creator|description|published_time|title|site_name)\s*`)
var namePattern = regexp.MustCompile(`(?i)^\s*(?:(dc|dcterm|og|twitter|parsely|weibo:(article|webpage))\s*[-\.:]\s*)?(author|creator|pub-date|description|title|site_name)\s*$`)
var articleTypes = regexp.MustCompile(`^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$`)
var schema = regexp.MustCompile(`^https?://schema\.org/?$`)
var cdata = regexp.MustCompile(`^\s*<!\[CDATA\[|\]\]>\s*$`)
var tokens = regexp.MustCompile(`[^a-zA-Z0-9_]+`)

func similarity(a, b string) float64 {
	as := tokens.Split(strings.ToLower(a), -1)
	bs := tokens.Split(strings.ToLower(b), -1)
	set := map[string]bool{}
	for _, v := range as {
		if v != "" {
			set[v] = true
		}
	}
	var all, unmatched []string
	for _, v := range bs {
		if v != "" {
			all = append(all, v)
			if !set[v] {
				unmatched = append(unmatched, v)
			}
		}
	}
	if len(set) == 0 || len(all) == 0 {
		return 0
	}
	return 1 - float64(dom.Length(strings.Join(unmatched, " ")))/float64(dom.Length(strings.Join(all, " ")))
}
func jsonMetadata(doc *html.Node, engine string) map[string]string {
	for n := range dom.IterElements(doc) {
		if n.Data != "script" || dom.Attr(n, "type") != "application/ld+json" {
			continue
		}
		var parsed any
		if json.Unmarshal([]byte(cdata.ReplaceAllString(dom.Text(n), "")), &parsed) != nil {
			continue
		}
		find := func(a []any) map[string]any {
			for _, v := range a {
				m, _ := v.(map[string]any)
				s, _ := m["@type"].(string)
				if articleTypes.MatchString(s) {
					return m
				}
			}
			return nil
		}
		if arr, ok := parsed.([]any); ok {
			parsed = find(arr)
		}
		p, _ := parsed.(map[string]any)
		if p == nil {
			continue
		}
		context, _ := p["@context"].(string)
		if m, ok := p["@context"].(map[string]any); ok {
			context, _ = m["@vocab"].(string)
		}
		if !schema.MatchString(context) {
			continue
		}
		if p["@type"] == nil || p["@type"] == "" {
			if arr, ok := p["@graph"].([]any); ok {
				p = find(arr)
			}
		}
		if p == nil {
			continue
		}
		typ, _ := p["@type"].(string)
		if !articleTypes.MatchString(typ) {
			continue
		}
		out := map[string]string{}
		name, nok := p["name"].(string)
		headline, hok := p["headline"].(string)
		if nok && hok && name != headline {
			title := articleTitle(doc)
			nm, hm := similarity(name, title) > .75, similarity(headline, title) > .75
			useName := true
			if engine == "mozilla" {
				useName = !(hm && !nm)
			} else {
				if !nm && !hm {
					dt := strings.ToLower(documentTitle(doc))
					nm = strings.Contains(dt, strings.ToLower(name))
					hm = strings.Contains(dt, strings.ToLower(headline))
				}
				if nm != hm {
					useName = nm
				} else {
					useName = dom.Length(name) >= dom.Length(headline)
				}
			}
			if useName {
				out["title"] = name
			} else {
				out["title"] = headline
			}
		} else if nok {
			out["title"] = trim(name)
		} else if hok {
			out["title"] = trim(headline)
		}
		authorName := func(v any) (string, bool) {
			m, _ := v.(map[string]any)
			s, ok := m["name"].(string)
			return trim(s), ok
		}
		if s, ok := authorName(p["author"]); ok {
			out["byline"] = s
		} else if a, ok := p["author"].([]any); ok && len(a) > 0 {
			if _, ok := authorName(a[0]); ok {
				var names []string
				for _, v := range a {
					if s, ok := authorName(v); ok {
						names = append(names, s)
					}
				}
				out["byline"] = strings.Join(names, ", ")
			}
		}
		for _, pair := range [][2]string{{"description", "excerpt"}, {"datePublished", "datePublished"}} {
			if s, ok := p[pair[0]].(string); ok {
				out[pair[1]] = trim(s)
			}
		}
		if s, ok := authorName(p["publisher"]); ok {
			out["siteName"] = s
		}
		return out
	}
	return map[string]string{}
}

var entities = regexp.MustCompile(`&(quot|amp|apos|lt|gt);`)
var numeric = regexp.MustCompile(`(?i)&#(?:x([0-9a-f]+)|([0-9]+));`)

func unescape(s string) string {
	s = entities.ReplaceAllStringFunc(s, func(v string) string {
		return map[string]string{"&quot;": "\"", "&amp;": "&", "&apos;": "'", "&lt;": "<", "&gt;": ">"}[v]
	})
	return numeric.ReplaceAllStringFunc(s, func(v string) string {
		digits := v[2 : len(v)-1]
		base := 10
		if digits[0] == 'x' || digits[0] == 'X' {
			digits = digits[1:]
			base = 16
		}
		r, e := strconv.ParseUint(digits, base, 64)
		if e != nil || r == 0 || r > 0x10ffff || (r >= 0xd800 && r <= 0xdfff) {
			r = 0xfffd
		}
		return string(rune(r))
	})
}
func Read(doc *html.Node, disableJSONLD bool) Data {
	return ReadWithEngine(doc, disableJSONLD, "chromium")
}
func ReadWithEngine(doc *html.Node, disableJSONLD bool, engine string) Data {
	d := Data{}
	values := map[string]string{}
	j := map[string]string{}
	if !disableJSONLD {
		j = jsonMetadata(doc, engine)
	}
	for n := range dom.IterElements(doc) {
		if n.Data == "html" {
			d.Lang = Ptr(dom.Attr(n, "lang"))
			d.Dir = Ptr(dom.Attr(n, "dir"))
		}
		if n.Data != "meta" {
			continue
		}
		content := dom.Attr(n, "content")
		if content == "" {
			continue
		}
		prop := dom.Attr(n, "property")
		key := propertyPattern.FindString(prop)
		if key != "" {
			key = ws.ReplaceAllString(strings.ToLower(key), "")
		} else {
			key = dom.Attr(n, "name")
			if !namePattern.MatchString(key) {
				continue
			}
			key = strings.ReplaceAll(ws.ReplaceAllString(strings.ToLower(key), ""), ".", ":")
		}
		values[key] = trim(content)
	}
	first := func(initial string, keys ...string) string {
		if initial != "" {
			return unescape(initial)
		}
		for _, key := range keys {
			if values[key] != "" {
				return unescape(values[key])
			}
		}
		return ""
	}
	d.Title = first(j["title"], "dc:title", "dcterm:title", "og:title", "weibo:article:title", "weibo:webpage:title", "title", "twitter:title", "parsely-title")
	if d.Title == "" {
		d.Title = unescape(articleTitle(doc))
	}
	author := values["article:author"]
	if u, e := url.Parse(author); e == nil && u.Scheme != "" {
		author = ""
	}
	d.Byline = Ptr(first(j["byline"], "dc:creator", "dcterm:creator", "author", "parsely-author"))
	if d.Byline == nil {
		d.Byline = Ptr(unescape(author))
	}
	d.Excerpt = Ptr(first(j["excerpt"], "dc:description", "dcterm:description", "og:description", "weibo:article:description", "weibo:webpage:description", "description", "twitter:description"))
	d.SiteName = Ptr(first(j["siteName"], "og:site_name"))
	d.PublishedTime = Ptr(first(j["datePublished"], "article:published_time", "parsely-pub-date"))
	return d
}
