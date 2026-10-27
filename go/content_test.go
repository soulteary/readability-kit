package readability

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestContentCleanup(t *testing.T) {
	cases := []struct{ name, input, text string }{
		{"inline whitespace", `<p>one<span> </span>two</p>`, "one two"},
		{"empty inline", `<p>one<span></span>two</p>`, "onetwo"},
		{"labels and announcements", `<div role="status">loading</div><p>Advertisement</p><p>supported by</p><p>Discussion of sponsored research.</p>`, "Discussion of sponsored research."},
		{"utf16 boundary", `<div role="status">` + strings.Repeat("😀", 100) + `</div>`, strings.Repeat("😀", 100)},
		{"unicode label case", `<p>SKIP ADVERTISEMENT</p><p>stay</p>`, "stay"},
		{"live previous sibling", `<p><b>Advertisement</b><span> </span>next</p>`, "next"},
		{"nested live previous sibling", `<p><b><i>Advertisement</i></b><span> </span>next</p>`, "next"},
		{"nested inline whitespace", `<p>one<span><em> </em></span>two</p>`, "one two"},
		{"removed ancestor", `<div role="alert"><p>gone</p></div><p>stay</p>`, "stay"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, text, err := processContent(tc.input, true)
			if err != nil || text != tc.text {
				t.Fatalf("text=%q err=%v; want %q", text, err, tc.text)
			}
		})
	}
	for _, input := range []string{`<figure><img src="/photo"></figure>`, `<div role="status"><picture><img src="/photo"></picture></div>`, `<math><mi>x</mi></math>`} {
		out, _, err := processContent(input, false)
		if err != nil || out == "" {
			t.Fatalf("media removed: %q, %v", out, err)
		}
	}
}

func TestSanitizerAdversarial(t *testing.T) {
	cases := []struct {
		name, input string
		absent      []string
	}{
		{"executables", `<script>alert(1)</script><style>bad</style><p onclick="alert(1)" style="x">safe</p><form><input></form>`, []string{"script", "style", "onclick", "form", "input", "alert(1)"}},
		{"encoded schemes", `<a href="jav&#x61;script:alert(1)">a</a><img src="java&#10;script:alert(2)"><a href="data:text/html,x">b</a>`, []string{"href=", "src=", "alert"}},
		{"svg namespace", `<svg><a xlink:href="javascript:alert(1)"><text>bad</text></a><foreignObject><p onclick="x">bad</p></foreignObject></svg><p>safe</p>`, []string{"xlink", "foreignObject", "onclick"}},
		{"math namespace", `<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math><p>safe</p>`, []string{"annotation", "onerror", "alert"}},
		{"namespace mutation", `<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">`, []string{"onerror", "alert", "style"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, _, err := processContent(tc.input, true)
			if err != nil {
				t.Fatal(err)
			}
			for _, bad := range tc.absent {
				if strings.Contains(out, bad) {
					t.Errorf("output contains %q: %s", bad, out)
				}
			}
			// Pin sanitizer stability under another HTML parse and serialization.
			again, _, err := processContent(out, true)
			if err != nil || again != out {
				t.Errorf("unstable output: %q -> %q (%v)", out, again, err)
			}
		})
	}
}

func TestSanitizerPreservesArticleMarkup(t *testing.T) {
	out, text, err := processContent(`<p><a href="https://example.com/a">safe</a> <code>x &lt; y</code><img src="/a" srcset="/a 1x, /b 2x" alt="photo"></p><table><tr><td>cell</td></tr></table>`, true)
	if err != nil || text != "safe x < ycell" {
		t.Fatalf("%q %v", text, err)
	}
	for _, want := range []string{`href="https://example.com/a"`, `srcset="/a 1x, /b 2x"`, `<table>`, `<code>`} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in %s", want, out)
		}
	}
	unsafe, _, err := processContent(`<p onclick="x">safe</p><script>x</script><p>advertisement</p>`, false)
	if err != nil || !strings.Contains(unsafe, "onclick") || !strings.Contains(unsafe, "script") || strings.Contains(unsafe, "advertisement") {
		t.Fatalf("sanitize=false cleanup: %s (%v)", unsafe, err)
	}
}

// Capture foreign-content policy used by the JavaScript DOMPurify API.
func TestSanitizerDOMPurifyPolicy(t *testing.T) {
	cases := []struct{ input, want string }{
		{"\n \t<p>text</p>", "\n \t<p>text</p>"},
		{`<svg><span><text>link</text></span><g onload="x"></g></svg>`, `<svg></svg>`},
		// DOMPurify treats srcset as an ordinary allowed attribute;
		// retain its exact policy rather than inventing a separate URL parser.
		{`<img src="/safe.png" srcset="/safe.png 1x, javascript:alert(1) 2x">`, `<img src="/safe.png" srcset="/safe.png 1x, javascript:alert(1) 2x">`},
		{`<svg><a xlink:href="javascript:alert(1)"><text>bad</text></a><foreignObject><p onclick="x">bad</p></foreignObject></svg><p>safe</p>`, `<svg><a><text>bad</text></a></svg><p>safe</p>`},
		{`<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math><p>safe</p>`, `<math></math><p>safe</p>`},
		{`<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">`, `<math><mtext><table></table></mtext></math>`},
		{`<p data-article="yes" aria-describedby="caption"><img src="data:image/png;base64,YQ=="></p>`, `<p data-article="yes" aria-describedby="caption"><img src="data:image/png;base64,YQ=="></p>`},
		{`<form><p>article text</p><input value="secret"></form>`, `<p>article text</p>`},
	}
	for _, tc := range cases {
		out, _, err := processContent(tc.input, true)
		if err != nil || out != tc.want {
			t.Errorf("input %s: got %s (%v), want %s", tc.input, out, err, tc.want)
		}
	}
}

func TestContentCorpusParity(t *testing.T) {
	b, e := os.ReadFile("../go-reports/javascript.json")
	if e != nil {
		t.Skip(e)
	}
	var report struct {
		Cases []struct {
			ID, Layer string
			Options   struct{ Sanitize any }
			Result    struct {
				Status  string
				Article *struct{ Content, TextContent string }
			}
		}
	}
	if e = json.Unmarshal(b, &report); e != nil {
		t.Fatal(e)
	}
	m := map[string]*struct{ Content, TextContent string }{}
	for _, c := range report.Cases {
		if c.Layer == "raw" {
			m[strings.TrimSuffix(c.ID, "/raw")] = c.Result.Article
		}
	}
	failures, total := 0, 0
	for _, c := range report.Cases {
		if c.Layer != "api" || c.Result.Article == nil {
			continue
		}
		raw := m[strings.TrimSuffix(c.ID, "/api")]
		if raw == nil {
			continue
		}
		total++
		sanitize := true
		if v, ok := c.Options.Sanitize.(bool); ok {
			sanitize = v
		}
		got, text, e := processContent(raw.Content, sanitize)
		if e != nil || got != c.Result.Article.Content || text != c.Result.Article.TextContent {
			failures++
			if failures < 12 {
				i := 0
				for i < len(got) && i < len(c.Result.Article.Content) && got[i] == c.Result.Article.Content[i] {
					i++
				}
				end := i + 100
				if end > len(got) {
					end = len(got)
				}
				wend := i + 100
				if wend > len(c.Result.Article.Content) {
					wend = len(c.Result.Article.Content)
				}
				t.Logf("%s offset %d got %q want %q", c.ID, i, got[i:end], c.Result.Article.Content[i:wend])
			}
		}
	}
	t.Logf("content corpus %d/%d differ", failures, total)
	if failures > 0 {
		t.Fail()
	}
}

func BenchmarkProcessContent(b *testing.B) {
	raw := strings.Repeat(`<section><p class="article" id="paragraph">The article discusses performance and compatibility with <a href="https://example.com/story">source material</a> and <img src="https://example.com/photo.jpg" alt="An article photo" width="640">.</p></section>`, 100)
	b.ReportAllocs()
	b.SetBytes(int64(len(raw)))
	for i := 0; i < b.N; i++ {
		if _, _, err := processContent(raw, true); err != nil {
			b.Fatal(err)
		}
	}
}
