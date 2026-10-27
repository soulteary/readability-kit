// SPDX-License-Identifier: Apache-2.0
package dom

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Trim mirrors ECMAScript String.trim (not Go's wider Unicode whitespace set).
func Trim(s string) string { return strings.TrimFunc(s, IsSpace) }
func IsSpace(r rune) bool {
	if r <= 0x7f {
		return r == ' ' || (r >= '\t' && r <= '\r')
	}
	return isUnicodeSpace(r)
}

func isUnicodeSpace(r rune) bool {
	return r == '\uFEFF' || r == '\u2028' || r == '\u2029' || unicode.Is(unicode.Zs, r)
}

// NormalizeSpace mirrors /\s{2,}/g: a single tab/newline remains untouched.
func NormalizeSpace(s string) string {
	var b strings.Builder
	start, count, copied := -1, 0, 0
	flush := func(end int) {
		if count > 1 {
			if b.Cap() == 0 {
				b.Grow(len(s))
			}
			b.WriteString(s[copied:start])
			b.WriteByte(' ')
			copied = end
		}
		count = 0
	}
	for i, r := range s {
		// The previous rune-based implementation repaired each invalid byte.
		// Valid HTML needs only the fast span-copy path below.
		if r == utf8.RuneError {
			if _, size := utf8.DecodeRuneInString(s[i:]); size == 1 {
				return NormalizeSpace(string([]rune(s)))
			}
		}
		if IsSpace(r) {
			if count == 0 {
				start = i
			}
			count++
		} else if count > 0 {
			flush(i)
		}
	}
	flush(len(s))
	if copied == 0 {
		return s
	}
	b.WriteString(s[copied:])
	return b.String()
}

var voidTags = map[string]bool{"area": true, "base": true, "basefont": true, "bgsound": true, "br": true, "col": true, "embed": true, "frame": true, "hr": true, "img": true, "input": true, "keygen": true, "link": true, "meta": true, "param": true, "source": true, "track": true, "wbr": true}
var rawTags = map[string]bool{"style": true, "script": true, "xmp": true, "iframe": true, "noembed": true, "noframes": true, "plaintext": true, "noscript": true}
var textEscaper = strings.NewReplacer("&", "&amp;", "\u00a0", "&nbsp;", "<", "&lt;", ">", "&gt;")
var attrEscaper = strings.NewReplacer("&", "&amp;", "\u00a0", "&nbsp;", "\"", "&quot;")

// Inner serializes like HTML DOM innerHTML, preserving attribute order and using
// HTML void-element syntax rather than x/net/html's XML-style self-closing tags.
func Inner(n *html.Node) string {
	var b strings.Builder
	size := 0
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		size += serializedSizeHint(c)
	}
	b.Grow(size)
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		serialize(&b, c)
	}
	return b.String()
}
func Outer(n *html.Node) string {
	var b strings.Builder
	b.Grow(serializedSizeHint(n))
	serialize(&b, n)
	return b.String()
}

// The unescaped length is a cheap lower bound. Reserving it avoids repeated
// geometric growth for article markup; escaping remains entirely in serialize.
func serializedSizeHint(n *html.Node) int {
	size := 0
	switch n.Type {
	case html.TextNode:
		return len(n.Data)
	case html.CommentNode:
		return len(n.Data) + 7
	case html.DoctypeNode:
		return len(n.Data) + 11
	case html.ElementNode:
		size = len(n.Data) + 2
		for _, a := range n.Attr {
			size += len(a.Key) + len(a.Val) + 4
			if a.Namespace != "" && (a.Namespace != "xmlns" || a.Key != "xmlns") {
				size += len(a.Namespace) + 1
			}
		}
		if n.Namespace == "" && voidTags[n.Data] {
			return size
		}
		size += len(n.Data) + 3
	case html.DocumentNode:
	default:
		return 0
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		size += serializedSizeHint(c)
	}
	return size
}
func serialize(b *strings.Builder, n *html.Node) {
	switch n.Type {
	case html.TextNode:
		if n.Parent != nil && n.Parent.Namespace == "" && rawTags[n.Parent.Data] {
			b.WriteString(n.Data)
		} else {
			_, _ = textEscaper.WriteString(b, n.Data)
		}
		return
	case html.CommentNode:
		b.WriteString("<!--")
		b.WriteString(n.Data)
		b.WriteString("-->")
		return
	case html.DoctypeNode:
		b.WriteString("<!DOCTYPE ")
		b.WriteString(n.Data)
		b.WriteByte('>')
		return
	case html.DocumentNode:
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			serialize(b, c)
		}
		return
	case html.ElementNode:
	default:
		return
	}
	b.WriteByte('<')
	b.WriteString(n.Data)
	for _, a := range n.Attr {
		b.WriteByte(' ')
		if a.Namespace != "" {
			if a.Namespace != "xmlns" || a.Key != "xmlns" {
				b.WriteString(a.Namespace)
				b.WriteByte(':')
			}
		}
		b.WriteString(a.Key)
		b.WriteString("=\"")
		_, _ = attrEscaper.WriteString(b, a.Val)
		b.WriteByte('"')
	}
	b.WriteByte('>')
	if n.Namespace == "" && voidTags[n.Data] {
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		serialize(b, c)
	}
	b.WriteString("</")
	b.WriteString(n.Data)
	b.WriteByte('>')
}
