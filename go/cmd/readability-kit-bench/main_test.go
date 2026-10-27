// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestChecksumUTF8(t *testing.T) {
	if got := checksum("hello"); got != "a430d84680aabd0b" {
		t.Fatalf("FNV-1a: %s", got)
	}
	if got := checksum(""); got != "cbf29ce484222325" {
		t.Fatalf("empty FNV-1a: %s", got)
	}
}

func TestWorkerProtocol(t *testing.T) {
	html := "<html><title>Benchmark article</title><body><article><p>" + strings.Repeat("This substantial article contains readable prose, details, and useful context. ", 20) + "</p></article></body></html>"
	for _, serialize := range []bool{true, false} {
		req := request{Cases: []benchCase{{ID: "fixture", HTML: html, Options: json.RawMessage(`{"url":"https://example.com/article","engine":"chromium"}`)}}, Warmup: 1, Iterations: 2}
		if !serialize {
			req.Serialize = &serialize
		}
		payload, _ := json.Marshal(req)
		var out bytes.Buffer
		if err := run(bytes.NewReader(payload), &out); err != nil {
			t.Fatal(err)
		}
		var got response
		if err := json.Unmarshal(out.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if len(got.Cases) != 1 {
			t.Fatalf("case count: %d", len(got.Cases))
		}
		r := got.Cases[0]
		if r.ID != "fixture" || len(r.DurationsNS) != 2 || len(r.Lengths) != 2 || len(r.Checksums) != 2 || len(r.OutputBytes) != 2 {
			t.Fatalf("invalid response: %+v", r)
		}
		for i := range r.DurationsNS {
			if r.DurationsNS[i] <= 0 || r.Lengths[i] <= 0 || len(r.Checksums[i]) != 16 {
				t.Fatalf("invalid measured result: %+v", r)
			}
			if (r.OutputBytes[i] > 0) != serialize {
				t.Fatalf("serialization bytes: %+v", r.OutputBytes)
			}
		}
		if r.Checksums[0] != r.Checksums[1] {
			t.Fatal("unstable text checksum")
		}
	}
}

func TestRejectInvalidRequests(t *testing.T) {
	for _, input := range []string{
		`{"cases":[],"iterations":1}`,
		`{"cases":[{}],"iterations":0}`,
		`{"cases":[{}],"iterations":1,"warmup":-1}`,
		`{"cases":[{"id":"bad","options":{"url":"invalid"}}],"iterations":1}`,
		`{"cases":[],"iterations":1} {}`,
		`{"cases":[{"id":"empty","html":"","options":{"url":"https://example.com"}}],"iterations":1}`,
	} {
		var out bytes.Buffer
		if err := run(strings.NewReader(input), &out); err == nil {
			t.Fatalf("accepted %s", input)
		}
		if out.Len() != 0 {
			t.Fatal("wrote partial successful response")
		}
	}
}

func TestAllowEmpty(t *testing.T) {
	input := `{"cases":[{"id":"empty","html":"","options":{"url":"https://example.com"}}],"iterations":2,"warmup":1,"allowEmpty":true}`
	var out bytes.Buffer
	if err := run(strings.NewReader(input), &out); err != nil {
		t.Fatal(err)
	}
	var got response
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	r := got.Cases[0]
	if len(r.Statuses) != 2 {
		t.Fatalf("statuses: %+v", r)
	}
	for i := range r.Statuses {
		if r.Statuses[i] != "empty" || r.Lengths[i] != 0 || r.Checksums[i] != "cbf29ce484222325" || r.OutputBytes[i] != 4 {
			t.Fatalf("invalid empty result: %+v", r)
		}
	}
}
