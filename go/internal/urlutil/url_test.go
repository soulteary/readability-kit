package urlutil

import (
	"github.com/soulteary/readability-kit/go/internal/html"
	"net/url"
	"strings"
	"testing"
)

func TestFirstBaseWithHref(t *testing.T) {
	doc, _ := html.Parse(strings.NewReader(`<base target="_blank"><base href="/assets/"><base href="/ignored/">`))
	source, _ := url.Parse("https://example.org/article")
	if got := Base(doc, source).String(); got != "https://example.org/assets/" {
		t.Fatal(got)
	}
}
func TestSrcsetDataURLAndRelativeCandidate(t *testing.T) {
	base, _ := url.Parse("https://example.org/assets/")
	got := fixSrcset(base, "data:image/png;base64,aGVsbG8= 1x, next.png 2x")
	if got != "data:image/png;base64,aGVsbG8= 1x, https://example.org/assets/next.png 2x" {
		t.Fatal(got)
	}
	got = fixSrcset(base, "one.png, two.png 2x")
	if got != "https://example.org/assets/one.png, https://example.org/assets/two.png 2x" {
		t.Fatal(got)
	}
}

func TestWhatwgURLSerialization(t *testing.T) {
	base, _ := url.Parse("https://example.test/section/page")
	for _, tc := range []struct{ in, want string }{
		{"https://www.TeAra.govt.nz/en/place-names/1", "https://www.teara.govt.nz/en/place-names/1"},
		{"https://example.test/path#", "https://example.test/path#"},
		{"https://example.test?x=1", "https://example.test/?x=1"},
		{"https://example.test:443/path", "https://example.test/path"},
		{"\u200b\u200bhttps://about.example.test/path", "https://example.test/section/%E2%80%8B%E2%80%8Bhttps://about.example.test/path"},
	} {
		if got := Resolve(base, tc.in); got != tc.want {
			t.Errorf("%q got %q want %q", tc.in, got, tc.want)
		}
	}
}
