// SPDX-License-Identifier: Apache-2.0
package dom

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/soulteary/readability-kit/go/internal/html"
)

// displayNone follows the pinned jsdom inline declaration cascade. Invalid
// declarations leave the previous value intact; the first important value wins.
// This only inspects inline styles, as do the reference engines.
func displayNone(style string) bool {
	return inlineCSSValue(style, "display", validDisplay) == "none"
}

// VisibilityHidden applies extraction's additional inline visibility check.
func VisibilityHidden(n *html.Node) bool {
	return inlineCSSValue(Attr(n, "style"), "visibility", validVisibility) == "hidden"
}

func validVisibility(v string) bool {
	if hasCSSVar(v) {
		return true
	}
	switch strings.ToLower(v) {
	case "visible", "hidden", "collapse", "inherit", "initial", "unset", "revert", "revert-layer":
		return true
	}
	return false
}

func inlineCSSValue(style, property string, valid func(string) bool) string {
	if !strings.Contains(style, property) {
		return ""
	}
	value := ""
	for _, decl := range cssDeclarations(style) {
		key, raw, ok := strings.Cut(decl, ":")
		if !ok || strings.TrimSpace(key) != property {
			continue
		}
		raw = strings.TrimSpace(raw)
		important := false
		if i := strings.LastIndexByte(raw, '!'); i >= 0 {
			if strings.EqualFold(strings.TrimSpace(raw[i+1:]), "important") {
				important = true
				raw = strings.TrimSpace(raw[:i])
			}
		}
		v := raw
		if !valid(v) {
			continue
		}
		value = strings.ToLower(v)
		if important {
			break
		}
	}
	return value
}

// cssDeclarations strips comments as token boundaries and splits only outside
// strings and functions, so text in URLs/custom properties cannot hide a node.
func cssDeclarations(style string) []string {
	var out []string
	var b strings.Builder
	depth := 0
	var quote byte
	for i := 0; i < len(style); i++ {
		c := style[i]
		if quote != 0 {
			b.WriteByte(c)
			if c == '\\' && i+1 < len(style) {
				i++
				b.WriteByte(style[i])
			} else if c == quote {
				quote = 0
			}
			continue
		}
		if c == '/' && i+1 < len(style) && style[i+1] == '*' {
			end := strings.Index(style[i+2:], "*/")
			if end < 0 {
				break
			}
			i += end + 3
			b.WriteByte(' ')
			continue
		}
		switch c {
		case '\'', '"':
			quote = c
		case '(':
			depth++
		case ')':
			if depth > 0 {
				depth--
			}
		case ';':
			if depth == 0 {
				out = append(out, b.String())
				b.Reset()
				continue
			}
		}
		b.WriteByte(c)
	}
	out = append(out, b.String())
	return out
}

func validDisplay(v string) bool {
	// Unresolved variables are accepted by CSSStyleDeclaration and do not
	// serialize as "none".
	if hasCSSVar(v) {
		return true
	}
	parts := strings.Fields(strings.ToLower(v))
	if len(parts) == 1 {
		switch parts[0] {
		case "none", "contents", "block", "inline", "run-in", "flow", "flow-root", "table", "flex", "grid", "ruby", "list-item", "inline-block", "inline-table", "inline-flex", "inline-grid", "table-row-group", "table-header-group", "table-footer-group", "table-row", "table-cell", "table-column-group", "table-column", "table-caption", "ruby-base", "ruby-text", "ruby-base-container", "ruby-text-container", "inherit", "initial", "unset", "revert", "revert-layer":
			return true
		}
		return false
	}
	if len(parts) < 2 || len(parts) > 3 {
		return false
	}
	outside, inside, list := false, false, false
	for _, p := range parts {
		switch p {
		case "block", "inline", "run-in":
			if outside {
				return false
			}
			outside = true
		case "flow", "flow-root", "table", "flex", "grid", "ruby":
			if inside {
				return false
			}
			inside = true
		case "list-item":
			if list {
				return false
			}
			list = true
		default:
			return false
		}
	}
	if list {
		for _, p := range parts {
			if p == "table" || p == "flex" || p == "grid" || p == "ruby" {
				return false
			}
		}
		return true
	}
	return outside && inside
}

// hasCSSVar mirrors the pinned jsdom helper's case-sensitive /^var\(/ and
// /(?<=[*/\s(])var\(/ checks, including its permissive unresolved values.
// In particular, xvar(), VAR(), and a quoted 'var()' are not recognized.
func hasCSSVar(v string) bool {
	for start := 0; start < len(v); {
		i := strings.Index(v[start:], "var(")
		if i < 0 {
			return false
		}
		i += start
		if i == 0 {
			return true
		}
		prev, _ := utf8.DecodeLastRuneInString(v[:i])
		if prev == '*' || prev == '/' || prev == '(' {
			return true
		}
		// Go's unicode.IsSpace includes U+0085, unlike ECMAScript \s. ECMAScript
		// additionally includes the byte-order mark U+FEFF.
		if (unicode.IsSpace(prev) && prev != '\u0085') || prev == '\ufeff' {
			return true
		}
		start = i + len("var(")
	}
	return false
}
