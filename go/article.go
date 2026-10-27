// SPDX-License-Identifier: Apache-2.0
package readability

// Engine selects the native extraction heuristic. Native modes are experimental.
type Engine string

const (
	Chromium Engine = "chromium"
	Mozilla  Engine = "mozilla"
)

// Article is detached from its input. Length counts UTF-16 code units.
type Article struct {
	Title         string  `json:"title"`
	Byline        *string `json:"byline"`
	Dir           *string `json:"dir"`
	Lang          *string `json:"lang"`
	Content       string  `json:"content"`
	TextContent   string  `json:"textContent"`
	Length        int     `json:"length"`
	Excerpt       *string `json:"excerpt"`
	SiteName      *string `json:"siteName"`
	PublishedTime *string `json:"publishedTime"`
	URL           string  `json:"url"`
	Engine        Engine  `json:"engine"`
}

// UTF16Len returns JavaScript string.length for valid Unicode text.
func UTF16Len(s string) int {
	n := 0
	for _, r := range s {
		n++
		if r > 0xffff {
			n++
		}
	}
	return n
}
