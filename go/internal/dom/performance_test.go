package dom

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"strings"
	"testing"
	"unicode"
)

func oldNormalizeSpace(s string) string {
	var b strings.Builder
	run := []rune{}
	flush := func() {
		if len(run) > 1 {
			b.WriteByte(' ')
		} else if len(run) == 1 {
			b.WriteRune(run[0])
		}
		run = run[:0]
	}
	for _, r := range s {
		if IsSpace(r) {
			run = append(run, r)
		} else {
			flush()
			b.WriteRune(r)
		}
	}
	flush()
	return b.String()
}
func TestNormalizeSpaceFastPath(t *testing.T) {
	for _, text := range []string{"a\xff\xff b", "\xef\xbf", "\x00\xc2\xa0\xff\n ", "replacement � stays"} {
		if got, want := NormalizeSpace(text), oldNormalizeSpace(text); got != want {
			t.Fatalf("%q: got %q want %q", text, got, want)
		}
	}
	alphabet := []rune{'a', ' ', '\t', '\n', '\u00a0', '\ufeff', '\u0085', '界', '😀'}
	for i := 0; i < 20000; i++ {
		n := i
		var s strings.Builder
		for j := 0; j < 7; j++ {
			s.WriteRune(alphabet[n%len(alphabet)])
			n /= len(alphabet)
		}
		text := s.String()
		if got, want := NormalizeSpace(text), oldNormalizeSpace(text); got != want {
			t.Fatalf("%q: got %q want %q", text, got, want)
		}
	}
}
func BenchmarkNormalizeSpace(b *testing.B) {
	text := strings.Repeat("A normal article paragraph with words, punctuation and 中文.\n\n", 100)
	b.Run("previous", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = oldNormalizeSpace(text)
		}
	})
	b.Run("optimized", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = NormalizeSpace(text)
		}
	})
}
func BenchmarkFindTitle(b *testing.B) {
	doc, err := html.Parse(strings.NewReader("<html><head><title>Article title</title></head><body>" + strings.Repeat("<div><p>Article text</p></div>", 1000) + "</body></html>"))
	if err != nil {
		b.Fatal(err)
	}
	b.Run("previous", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			for _, n := range Elements(doc) {
				if n.Data == "title" {
					break
				}
			}
		}
	})
	b.Run("optimized", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			_ = Find(doc, "title")
		}
	})
}

func TestIsSpaceECMAScriptFastPath(t *testing.T) {
	for r := rune(0); r <= 0x10ffff; r++ {
		want := r == '\uFEFF' || r == '\t' || r == '\n' || r == '\v' || r == '\f' || r == '\r' || r == '\u2028' || r == '\u2029' || unicode.Is(unicode.Zs, r)
		if got := IsSpace(r); got != want {
			t.Fatalf("U+%04X: got %v want %v", r, got, want)
		}
	}
}
