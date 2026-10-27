package engine

import (
	"math"
	"regexp"
	"strings"

	"github.com/soulteary/readability-kit/go/internal/dom"
	"github.com/soulteary/readability-kit/go/internal/html"
)

// previousLeadElements follows element siblings and climbs parents, matching
// Readability's bounded backwards scan rather than traversing each descendant.
func previousLeadElements(n *html.Node, count int) []*html.Node {
	var result []*html.Node
	previous := func(n *html.Node) *html.Node {
		for p := n.PrevSibling; p != nil; p = p.PrevSibling {
			if p.Type == html.ElementNode {
				return p
			}
		}
		return nil
	}
	for i := 0; i < count; i++ {
		for n != nil && previous(n) == nil {
			n = n.Parent
		}
		if n == nil {
			break
		}
		n = previous(n)
		result = append(result, n)
	}
	return result
}
func leadDescendants(n *html.Node, tag string) []*html.Node {
	var out []*html.Node
	for _, x := range dom.Elements(n) {
		if x != n && x.Data == tag {
			out = append(out, x)
		}
	}
	return out
}

type leadImageRating struct {
	score float64
	image *html.Node
}

func rateLeadImage(n *html.Node) *leadImageRating {
	images := leadDescendants(n, "img")
	if len(images) == 0 {
		return nil
	}
	score := 0.
	class, id := dom.Attr(n, "class"), dom.Attr(n, "id")
	if strings.Contains(class, "hero") || strings.Contains(id, "hero") {
		score += 100
	}
	if negative.MatchString(class) || negative.MatchString(id) {
		score -= 50
	}
	imageScore := func(n *html.Node) float64 {
		s := 0.
		if srcset := dom.Attr(n, "srcset"); srcset != "" {
			s += 30 + math.Min(10, .1*float64(dom.Length(srcset)))
		}
		if alt := dom.Attr(n, "alt"); dom.Length(alt) > 10 {
			s += 30 + math.Min(10, .1*float64(dom.Length(alt)))
		}
		return s
	}
	best := images[0]
	bestScore := imageScore(best)
	for _, img := range images[1:] {
		if s := imageScore(img); s > bestScore {
			best, bestScore = img, s
		}
	}
	score += bestScore
	if length := dom.Length(strings.TrimSpace(dom.Text(n))); length > 300 {
		score -= .25 * float64(length-300)
	}
	return &leadImageRating{score, best}
}

type leadCaptionRating struct {
	score       float64
	makeCaption func() *html.Node
}

var captionCredit = regexp.MustCompile(`(?i)\b(credit|source|photo:)\b`)

func rateLeadCaption(n *html.Node) *leadCaptionRating {
	if captions := leadDescendants(n, "figcaption"); len(captions) > 0 {
		return &leadCaptionRating{100, func() *html.Node { return dom.Clone(captions[0]) }}
	}
	fromText := func(tag string, score float64) *leadCaptionRating {
		var parts []string
		for _, x := range leadDescendants(n, tag) {
			parts = append(parts, dom.Text(x))
		}
		s := strings.Join(parts, " ")
		if s == "" {
			return nil
		}
		if tag == "p" && captionCredit.MatchString(s) {
			score = 95
		}
		return &leadCaptionRating{score, func() *html.Node {
			caption := element("figcaption")
			caption.AppendChild(&html.Node{Type: html.TextNode, Data: s})
			return caption
		}}
	}
	if rating := fromText("cite", 95); rating != nil {
		return rating
	}
	return fromText("p", 80)
}

// leadImage extracts Chromium's highest rated preceding image and caption,
// removing their source containers before the sibling inclusion pass.
func leadImage(top *html.Node) *html.Node {
	candidates := previousLeadElements(top, 10)
	var bestImage *leadImageRating
	imageIndex := 0
	bestScore := -1.
	for i, n := range candidates {
		rating := rateLeadImage(n)
		score := -1.
		if rating != nil {
			score = rating.score
		}
		if i == 0 || score > bestScore {
			bestImage, imageIndex, bestScore = rating, i, score
		}
	}
	if bestImage == nil || bestImage.score < 30 {
		return nil
	}
	var bestCaption *leadCaptionRating
	captionIndex := 0
	bestScore = -1
	for i, n := range candidates[:imageIndex+1] {
		rating := rateLeadCaption(n)
		score := -1.
		if rating != nil {
			score = rating.score
		}
		if i == 0 || score > bestScore {
			bestCaption, captionIndex, bestScore = rating, i, score
		}
	}
	figure := element("figure")
	image := element("img")
	dom.Set(image, "src", dom.Attr(bestImage.image, "src"))
	figure.AppendChild(image)
	if bestCaption != nil {
		caption := bestCaption.makeCaption()
		caption.Attr = nil
		if caption.FirstChild != nil {
			figure.AppendChild(caption)
		}
	}
	dom.Remove(candidates[imageIndex])
	if bestCaption != nil {
		dom.Remove(candidates[captionIndex])
	}
	return figure
}
