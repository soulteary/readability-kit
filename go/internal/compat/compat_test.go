package compat

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestEnvelopes(t *testing.T) {
	for _, tc := range []struct {
		request, status string
		article         any
	}{
		{`{"html":"","options":{},"layer":"readerable"}`, "ok", false},
		{`{"html":"","options":{"url":"https://example.com"},"layer":"api"}`, "empty", nil},
		{`{"html":"","options":{"minScore":null},"layer":"readerable"}`, "error", nil},
		{`{"html":"","layer":"unknown"}`, "error", nil},
		{`{"html":null}`, "error", nil}, {`{} {}`, "error", nil}, {`invalid`, "error", nil},
	} {
		var output bytes.Buffer
		if err := Run(context.Background(), strings.NewReader(tc.request), &output); err != nil {
			t.Fatal(err)
		}
		var result envelope
		if err := json.Unmarshal(output.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Status != tc.status || result.Article != tc.article {
			t.Fatalf("%s: %s", tc.request, output.String())
		}
		if tc.status == "error" && result.Error == "" {
			t.Fatal("missing error")
		}
	}
}
