package readability

import (
	"context"
	"fmt"
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/engine"
	"github.com/soulteary/readability-kit/go/internal/html"
	"github.com/soulteary/readability-kit/go/internal/metadata"
	"github.com/soulteary/readability-kit/go/internal/urlutil"
	"io"
	"math"
	"net/url"
	"strings"
)

// Extract reads static HTML and extracts an article. The DOM is built in memory.
func Extract(ctx context.Context, input io.Reader, opts ExtractOptions) (*Article, error) {
	if err := validateOptions(opts); err != nil {
		return nil, err
	}
	if err := checkContext(ctx); err != nil {
		return nil, err
	}
	if input == nil {
		return nil, &Error{Code: "parse", Message: "input reader must not be nil."}
	}
	var reader io.Reader = contextReader{ctx: ctx, input: input}
	if opts.Limits.MaxInputBytes > 0 && opts.Limits.MaxInputBytes < math.MaxInt64 {
		reader = io.LimitReader(reader, opts.Limits.MaxInputBytes+1)
	}
	b, err := io.ReadAll(reader)
	if cancelErr := checkContext(ctx); cancelErr != nil {
		return nil, cancelErr
	}
	if err != nil {
		return nil, &Error{Code: "parse", Message: err.Error(), Cause: err}
	}
	return ExtractHTML(ctx, string(b), opts)
}

// ExtractHTML extracts and cleans static HTML using the native preview heuristic.
func ExtractHTML(ctx context.Context, input string, opts ExtractOptions) (*Article, error) {
	return extractHTML(ctx, input, opts, false)
}

// ExtractRawHTML bypasses the final sanitizer and semantic cleanup for differential testing.
func ExtractRawHTML(ctx context.Context, input string, opts ExtractOptions) (*Article, error) {
	return extractHTML(ctx, input, opts, true)
}
func parseInput(ctx context.Context, input string, limits Limits, maxElements int) (*html.Node, error) {
	if err := checkContext(ctx); err != nil {
		return nil, err
	}
	if limits.MaxInputBytes > 0 && int64(len(input)) > limits.MaxInputBytes {
		return nil, &Error{Code: "input_limit", Message: "input exceeds MaxInputBytes."}
	}
	doc, err := html.ParseWithOptions(contextReader{ctx: ctx, input: strings.NewReader(input)}, html.ParseOptionEnableScripting(false))
	if cancelErr := checkContext(ctx); cancelErr != nil {
		return nil, cancelErr
	}
	if err != nil {
		return nil, &Error{Code: "parse", Message: err.Error(), Cause: err}
	}
	// With no structural budget and an uncancellable context there is nothing
	// for the post-parse validation walk to check.
	if limits.MaxNodes <= 0 && limits.MaxDepth <= 0 && maxElements <= 0 && ctx.Done() == nil {
		return doc, nil
	}
	type item struct {
		n     *html.Node
		depth int
	}
	stack := []item{{doc, 0}}
	nodes, elements := 0, 0
	for len(stack) > 0 {
		if err := checkContext(ctx); err != nil {
			return nil, err
		}
		x := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		nodes++
		if limits.MaxNodes > 0 && nodes > limits.MaxNodes {
			return nil, &Error{Code: "input_limit", Message: "document exceeds MaxNodes."}
		}
		if limits.MaxDepth > 0 && x.depth > limits.MaxDepth {
			return nil, &Error{Code: "input_limit", Message: "document exceeds MaxDepth."}
		}
		if x.n.Type == html.ElementNode {
			elements++

		}
		for c := x.n.FirstChild; c != nil; c = c.NextSibling {
			stack = append(stack, item{c, x.depth + 1})
		}
	}
	if maxElements > 0 && elements > maxElements {
		return nil, &Error{Code: "element_limit", Message: fmt.Sprintf("Aborting parsing document; %d elements found", elements)}
	}
	return doc, nil
}
func extractHTML(ctx context.Context, input string, o ExtractOptions, raw bool) (*Article, error) {
	if raw {
		if o.CharThreshold != nil && *o.CharThreshold == 0 {
			o.CharThreshold = nil
		}
		if o.NbTopCandidates != nil && *o.NbTopCandidates == 0 {
			o.NbTopCandidates = nil
		}
	}
	var source *url.URL
	if raw {
		source, _ = url.Parse(o.URL)
		if source == nil || source.Scheme == "" {
			return nil, optionError("url", "Invalid URL: "+o.URL)
		}
	} else {
		if err := validateOptions(o); err != nil {
			return nil, err
		}
		source, _ = validateURL(o.URL)
	}
	e, _ := normalizedEngine(o.Engine)
	doc, err := parseInput(ctx, input, o.Limits, intValue(o.MaxElemsToParse, 0))
	if err != nil {
		return nil, err
	}
	m := metadata.ReadWithEngine(doc, boolValue(o.DisableJSONLD, false), string(e))
	base := urlutil.Base(doc, source)
	if !raw {
		for n := range dom.IterElements(doc) {
			if n.Data == "img" {
				if src := dom.Attr(n, "src"); src != "" {
					dom.Set(n, "src", urlutil.Resolve(base, src))
				}
			}
		}
	}
	fields := &engine.Fields{}
	// Metadata and base URLs have been read; this request owns the parsed tree
	// and has no further use for it outside the extractor.
	result, err := engine.ExtractOwned(ctx, doc, engine.Options{Fields: fields, Engine: string(e), Title: m.Title, Byline: pointerValue(m.Byline), CharThreshold: intValue(o.CharThreshold, 500), NbTopCandidates: intValue(o.NbTopCandidates, 5), KeepClasses: boolValue(o.KeepClasses, false), ClassesToPreserve: o.ClassesToPreserve, LinkDensityModifier: floatValue(o.LinkDensityModifier, 0)})
	if err != nil {
		return nil, &Error{Code: "canceled", Message: err.Error(), Cause: err}
	}
	if result == nil {
		return nil, nil
	}
	if m.Byline == nil {
		m.Byline = metadata.Ptr(fields.Byline)
	}
	m.Dir = metadata.Ptr(fields.Dir)
	urlutil.FixWithSource(result, base, source)
	engine.PostProcess(result, engine.Options{KeepClasses: boolValue(o.KeepClasses, false), ClassesToPreserve: o.ClassesToPreserve})
	content, text := dom.Inner(result), ""
	if raw {
		text = dom.Text(result)
	} else {
		content, text, err = processContent(content, boolValue(o.Sanitize, true))
		if err != nil {
			return nil, &Error{Code: "output", Message: err.Error(), Cause: err}
		}
	}
	if err := checkContext(ctx); err != nil {
		return nil, err
	}
	if m.Excerpt == nil {
		if p := dom.Find(result, "p"); p != nil {
			m.Excerpt = metadata.Ptr(dom.Trim(dom.Text(p)))
		}
	}
	return &Article{Title: m.Title, Byline: m.Byline, Dir: m.Dir, Lang: m.Lang, Content: content, TextContent: text, Length: UTF16Len(text), Excerpt: m.Excerpt, SiteName: m.SiteName, PublishedTime: m.PublishedTime, URL: source.String(), Engine: e}, nil
}

// contextReader observes cancellation between reads; it cannot interrupt a
// blocking caller-owned Reader.Read invocation.
type contextReader struct {
	ctx   context.Context
	input io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.input.Read(p)
}

func pointerValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
