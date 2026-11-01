package readability

import (
	"context"
	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/engine"
	"github.com/soulteary/readability-kit/go/internal/html"
	"math"
	"strings"
)

// IsProbablyReaderable implements the pinned engines' lightweight scoring check.
func IsProbablyReaderable(ctx context.Context, input string, o ReaderableOptions) (bool, error) {
	if err := validateReaderableOptions(o); err != nil {
		return false, err
	}
	e, _ := normalizedEngine(o.Engine)
	doc, err := parseInput(ctx, input, o.Limits, 0)
	if err != nil {
		return false, err
	}
	nodes := readerableNodes(doc)
	score := 0.
	min := intValue(o.MinContentLength, 140)
	for _, n := range nodes {
		if err := checkContext(ctx); err != nil {
			return false, err
		}
		if !dom.Visible(n) || engine.Unlikely(dom.Attr(n, "class")+" "+dom.Attr(n, "id"), string(e)) {
			continue
		}
		if isListParagraph(n) {
			continue
		}
		length := UTF16Len(strings.TrimSpace(dom.Text(n)))
		if length < min {
			continue
		}
		score += math.Sqrt(float64(length - min))
		if score > floatValue(o.MinScore, 20) {
			return true, nil
		}
	}
	return false, nil
}

// readerableNodes keeps ordinary candidates before divs containing line breaks,
// matching the pinned engines' scoring order.
func readerableNodes(doc *html.Node) []*html.Node {
	nodes := []*html.Node{}
	divs := []*html.Node{}
	seen := map[*html.Node]bool{}
	for n := range dom.IterElements(doc) {
		switch n.Data {
		case "p", "pre", "article":
			nodes = append(nodes, n)
			seen[n] = true
		case "br":
			if n.Parent != nil && n.Parent.Data == "div" && !seen[n.Parent] {
				divs = append(divs, n.Parent)
				seen[n.Parent] = true
			}
		}
	}
	nodes = append(nodes, divs...)
	return nodes
}

func isListParagraph(n *html.Node) bool {
	if n.Data != "p" {
		return false
	}
	for parent := n.Parent; parent != nil; parent = parent.Parent {
		if parent.Data == "li" {
			return true
		}
	}
	return false
}
