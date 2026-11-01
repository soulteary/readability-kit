// Copyright 2026 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package html

import (
	"bytes"
	"runtime"
	"strings"
	"testing"
)

func TestRenderFosteredForeignContent(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
	}{
		{
			in:   `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
			want: "<html><head></head><body><math><mtext><mglyph><style>&lt;img src=x onerror=alert(1)&gt;</style></mglyph><table></table></mtext></math></body></html>",
		},
		{
			in:   `<math><mtext><table><mglyph><svg><desc><style><img src=x onerror=alert(1)>`,
			want: "<html><head></head><body><math><mtext><mglyph><svg><desc><style>&lt;img src=x onerror=alert(1)&gt;</style></desc></svg></mglyph><table></table></mtext></math></body></html>",
		},
		{
			in:   `<math><mtext><table><malignmark><svg><desc><style><img src=x onerror=alert(1)>`,
			want: "<html><head></head><body><math><mtext><malignmark><svg><desc><style>&lt;img src=x onerror=alert(1)&gt;</style></desc></svg></malignmark><table></table></mtext></math></body></html>",
		},
	} {
		d, err := Parse(strings.NewReader(tc.in))
		if err != nil {
			t.Fatal(err)
		}
		buf := bytes.NewBuffer(nil)
		if err := Render(buf, d); err != nil {
			t.Fatal(err)
		}

		if buf.String() != tc.want {
			t.Errorf("unexpected output for %q:\ngot:  %q\nwant: %q", tc.in, buf.String(), tc.want)
		}
	}
}

func TestTextNodeCoalescing(t *testing.T) {
	const n = 10000
	for _, tc := range []struct {
		name  string
		input string
	}{
		{"body", strings.Repeat("a</x>", n)},
		{"foster", "<table>" + strings.Repeat("a</x>", n)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var m1, m2 runtime.MemStats
			runtime.GC()
			runtime.ReadMemStats(&m1)
			doc, err := Parse(strings.NewReader(tc.input))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			runtime.ReadMemStats(&m2)

			body := doc.FirstChild.LastChild
			text := body.FirstChild
			if text == nil || text.Type != TextNode {
				t.Fatalf("got first child %v, want TextNode", text)
			}
			if len(text.Data) != n {
				t.Errorf("got text length %d, want %d", len(text.Data), n)
			}

			// Coalescing n 1-byte text tokens should not require O(n^2) memory.
			if alloc := m2.TotalAlloc - m1.TotalAlloc; alloc > 5<<20 {
				t.Errorf("Parse allocated %d bytes, want <= %d", alloc, 5<<20)
			}
		})
	}
}
