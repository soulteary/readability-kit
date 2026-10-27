package readability

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
)

func threshold(n int) *int { return &n }

func TestStructuralBudgetsWithCancelableAndBackgroundContexts(t *testing.T) {
	input := "<html><body><article><p>Article text.</p></article></body></html>"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	for _, current := range []context.Context{context.Background(), ctx} {
		for _, limits := range []Limits{{MaxNodes: 1}, {MaxDepth: 1}} {
			_, err := ExtractHTML(current, input, ExtractOptions{URL: "https://example.org/", Limits: limits})
			var detail *Error
			if !errors.As(err, &detail) || detail.Code != "input_limit" {
				t.Fatalf("limits=%+v: %v", limits, err)
			}
		}
		_, err := ExtractHTML(current, input, ExtractOptions{URL: "https://example.org/", MaxElemsToParse: threshold(1)})
		var detail *Error
		if !errors.As(err, &detail) || detail.Code != "element_limit" {
			t.Fatalf("element budget: %v", err)
		}
	}
}

func TestExtractArticleMetadataLinksAndClasses(t *testing.T) {
	input := `<!doctype html><html lang="zh"><head><title>A detailed article title - Example</title><base href="https://cdn.example/section/"><meta name="author" content="Writer"><script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"JSON headline","datePublished":"2026-10-27"}</script></head><body><nav>Menu</nav><article class="article keep drop"><h1>A heading</h1><p>` + strings.Repeat("这是正文内容，保留信息。", 80) + `<a href="next">read more</a><img src="picture.jpg"></p></article><aside class="sidebar">Sidebar</aside></body></html>`
	a, err := ExtractHTML(context.Background(), input, ExtractOptions{URL: "https://example.org/start", ClassesToPreserve: []string{"keep"}})
	if err != nil || a == nil {
		t.Fatalf("extract: %v %v", a, err)
	}
	if a.Title != "JSON headline" || a.Byline == nil || *a.Byline != "Writer" || a.Lang == nil || *a.Lang != "zh" {
		t.Fatalf("metadata: %+v", a)
	}
	if !strings.Contains(a.Content, `https://cdn.example/section/next`) || !strings.Contains(a.Content, `https://cdn.example/section/picture.jpg`) {
		t.Fatalf("URLs: %s", a.Content)
	}
	if strings.Contains(a.Content, "Sidebar") || strings.Contains(a.Content, "drop") || !strings.Contains(a.Content, `class="keep"`) {
		t.Fatalf("cleanup: %s", a.Content)
	}
	if a.Length != UTF16Len(a.TextContent) {
		t.Fatal("UTF16 length")
	}
}
func TestExtractNativeEngineDifference(t *testing.T) {
	input := `<html><body><article class="content"><p>` + strings.Repeat("A complete sentence, with detail. ", 30) + `</p><p class="continue-read-break">Unique continuation survives Chromium.</p></article></body></html>`
	c, err := ExtractHTML(context.Background(), input, ExtractOptions{URL: "https://example.org", Engine: Chromium, CharThreshold: threshold(1)})
	if err != nil {
		t.Fatal(err)
	}
	m, err := ExtractHTML(context.Background(), input, ExtractOptions{URL: "https://example.org", Engine: Mozilla, CharThreshold: threshold(1)})
	if err != nil {
		t.Fatal(err)
	}
	if c == nil || m == nil || !strings.Contains(c.TextContent, "Unique continuation") || strings.Contains(m.TextContent, "Unique continuation") {
		t.Fatalf("modes must use distinct pinned ad-break rules: chromium=%+v mozilla=%+v", c, m)
	}
}
func TestLimitsCancellationAndReader(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ExtractHTML(ctx, "<p>test</p>", ExtractOptions{URL: "https://example.org"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation: %v", err)
	}
	_, err = ExtractHTML(context.Background(), "<p>test</p>", ExtractOptions{URL: "https://example.org", Limits: Limits{MaxInputBytes: 2}})
	var e *Error
	if !errors.As(err, &e) || e.Code != "input_limit" {
		t.Fatalf("limit: %v", err)
	}
	_, err = ExtractHTML(context.Background(), "<p>test</p>", ExtractOptions{URL: "https://example.org", MaxElemsToParse: threshold(1)})
	if !errors.As(err, &e) || e.Code != "element_limit" {
		t.Fatalf("element limit: %v", err)
	}
	_, err = Extract(context.Background(), errReader{}, ExtractOptions{URL: "https://example.org"})
	if !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("reader error: %v", err)
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
func TestReaderablePinnedRules(t *testing.T) {
	paragraph := strings.Repeat("😀中文正文", 120)
	for _, tt := range []struct {
		html string
		want bool
	}{{"<p>" + paragraph + "</p>", true}, {"<p hidden>" + paragraph + "</p>", false}, {"<ul><li><p>" + paragraph + "</p></li></ul>", false}, {"<div>" + paragraph + "<br></div>", true}, {"<p class=sidebar>" + paragraph + "</p>", false}} {
		got, err := IsProbablyReaderable(context.Background(), tt.html, ReaderableOptions{})
		if err != nil || got != tt.want {
			t.Fatalf("readerability got %v error %v want %v", got, err, tt.want)
		}
	}
}
func TestRawZeroDefaultsAndEmptyInput(t *testing.T) {
	a, err := ExtractRawHTML(context.Background(), "<p>Short article.</p>", ExtractOptions{URL: "https://example.org", CharThreshold: threshold(0), NbTopCandidates: threshold(0)})
	if err != nil || a == nil {
		t.Fatalf("raw defaults: %v %v", a, err)
	}
	a, err = ExtractHTML(context.Background(), "<script>alert(1)</script>", ExtractOptions{URL: "https://example.org"})
	if err != nil || a != nil {
		t.Fatalf("empty: %v %v", a, err)
	}
}

func TestReaderMaxInt64BudgetDoesNotOverflow(t *testing.T) {
	a, err := Extract(context.Background(), strings.NewReader("<p>Some article text.</p>"), ExtractOptions{URL: "https://example.org", Limits: Limits{MaxInputBytes: 1<<63 - 1}})
	if err != nil || a == nil || !strings.Contains(a.TextContent, "Some article") {
		t.Fatalf("max budget overflow: article=%v err=%v", a, err)
	}
}
func TestReaderCancellationDuringRead(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	_, err := Extract(ctx, cancelReader{cancel: cancel}, ExtractOptions{URL: "https://example.org"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("read cancellation: %v", err)
	}
}

type cancelReader struct{ cancel context.CancelFunc }

func (r cancelReader) Read(p []byte) (int, error) {
	r.cancel()
	copy(p, "<p>text</p>")
	return len("<p>text</p>"), nil
}
func TestMalformedJSONLDIsIgnored(t *testing.T) {
	for _, json := range []string{`null`, `42`, `[null,42,"text"]`, `{"@context":"https://schema.org","@type":"NewsArticle","author":[null,4,{},"First",{"name":"Second"}],"publisher":null}`} {
		a, err := ExtractHTML(context.Background(), `<head><script type="application/ld+json">`+json+`</script></head><body><p>Some article body.</p></body>`, ExtractOptions{URL: "https://example.org"})
		if err != nil || a == nil {
			t.Fatalf("JSONLD %s: %v %v", json, a, err)
		}
		if a.Byline != nil {
			t.Fatalf("author ordering: %v", a.Byline)
		}
	}
}
func TestRawTextPreservesEngineWhitespace(t *testing.T) {
	a, err := ExtractRawHTML(context.Background(), "<article>\n<p> Some article text. </p>\n</article>", ExtractOptions{URL: "https://example.org"})
	if err != nil || a == nil {
		t.Fatalf("extract: %v %v", a, err)
	}
	if a.TextContent == strings.TrimSpace(a.TextContent) {
		t.Fatalf("raw engine text must preserve outer whitespace: %q", a.TextContent)
	}
}

func TestRawAllowsFileURLAndFractionalThreshold(t *testing.T) {
	raw := json.RawMessage(`{"url":"file:///tmp/article.html","charThreshold":1.5}`)
	if _, err := DecodeExtractOptions(raw, true); err == nil {
		t.Fatal("public options must reject file URL")
	}
	opts, err := DecodeExtractOptions(raw, false)
	if err != nil {
		t.Fatal(err)
	}
	if opts.CharThreshold == nil || *opts.CharThreshold != 2 {
		t.Fatalf("raw fractional threshold: %+v", opts.CharThreshold)
	}
	a, err := ExtractRawHTML(context.Background(), `<title>A file article</title><p>An article stored locally.</p>`, opts)
	if err != nil || a == nil {
		t.Fatalf("raw file extraction: %+v %v", a, err)
	}
	if _, err = DecodeExtractOptions(json.RawMessage(`{"url":"https://example.com","charThreshold":1.5}`), true); err == nil {
		t.Fatal("public threshold must be integral")
	}
}
func TestAbsentArticleMetadataSerializesNull(t *testing.T) {
	a, err := ExtractRawHTML(context.Background(), `<p>An article without metadata.</p>`, ExtractOptions{URL: "https://example.org"})
	if err != nil || a == nil {
		t.Fatalf("extract: %+v %v", a, err)
	}
	b, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err = json.Unmarshal(b, &value); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"byline", "dir", "lang", "siteName", "publishedTime"} {
		v, ok := value[key]
		if !ok || v != nil {
			t.Fatalf("%s: present=%v value=%v", key, ok, v)
		}
	}
}
