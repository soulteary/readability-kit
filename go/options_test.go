package readability

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

func TestJSONOptionBoundary(t *testing.T) {
	cases := []struct{ raw, want string }{
		{`{"url":"https://example.com","sanitize":null}`, "sanitize must be a boolean."},
		{`{"url":"https://example.com","charThreshold":null}`, "charThreshold must be a finite integer greater than or equal to 1."},
		{`{"url":"https://example.com","classesToPreserve":[null]}`, "classesToPreserve must be an array of strings."},
		{`{"url":"https://example.com","nbTopCandidates":1.5}`, "nbTopCandidates must be a finite integer greater than or equal to 1."},
		{`{"url":"file:///tmp/a"}`, "url must be an absolute HTTP(S) URL."},
	}
	for _, tc := range cases {
		_, err := DecodeExtractOptions(json.RawMessage(tc.raw), true)
		if err == nil || err.Error() != tc.want {
			t.Errorf("%s: got %v want %s", tc.raw, err, tc.want)
		}
	}
	o, err := DecodeExtractOptions(json.RawMessage(`{"url":"https://example.com","engine":null,"unknown":true,"sanitize":false,"classesToPreserve":["", "a:b"]}`), true)
	if err != nil || o.Engine != Chromium || o.Sanitize == nil || *o.Sanitize {
		t.Fatalf("unexpected options: %+v %v", o, err)
	}
}
func TestTypedOptionsAndUTF16(t *testing.T) {
	n := math.NaN()
	err := validateOptions(ExtractOptions{URL: "https://example.com", LinkDensityModifier: &n})
	var e *Error
	if !errors.As(err, &e) || e.Option != "linkDensityModifier" {
		t.Fatal(err)
	}
	if UTF16Len("中文😀e\u0301") != 6 {
		t.Fatal("wrong UTF-16 count")
	}
}
func TestURLCanonicalization(t *testing.T) {
	u, err := validateURL("https://EXAMPLE.com:443")
	if err != nil || u.String() != "https://example.com/" {
		t.Fatalf("%v %v", u, err)
	}
}
