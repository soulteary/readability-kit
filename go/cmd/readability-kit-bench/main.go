// SPDX-License-Identifier: Apache-2.0
// Resident benchmark worker; protocol decoding and checksums are outside timing.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	readability "github.com/soulteary/readability-kit/go"
)

type benchCase struct {
	ID      string          `json:"id"`
	HTML    string          `json:"html"`
	Options json.RawMessage `json:"options"`
}
type request struct {
	Cases      []benchCase `json:"cases"`
	Warmup     int         `json:"warmup"`
	Iterations int         `json:"iterations"`
	Serialize  *bool       `json:"serialize"`
	AllowEmpty bool        `json:"allowEmpty"`
}
type caseResult struct {
	ID          string   `json:"id"`
	DurationsNS []int64  `json:"durationsNs"`
	Lengths     []int    `json:"lengths"`
	Checksums   []string `json:"checksums"`
	OutputBytes []int    `json:"outputBytes"`
	Statuses    []string `json:"statuses"`
}
type response struct {
	Cases []caseResult `json:"cases"`
}

// Keep the actual serialized bytes observable without retaining every article.
var outputSink []byte
var articleSink *readability.Article

func checksum(text string) string {
	hash := uint64(0xcbf29ce484222325)
	for i := 0; i < len(text); i++ {
		hash = (hash ^ uint64(text[i])) * 0x100000001b3
	}
	return fmt.Sprintf("%016x", hash)
}

func run(input io.Reader, output io.Writer) error {
	var req request
	if err := readability.DecodeJSONRequest(input, &req); err != nil {
		return err
	}
	if req.Iterations <= 0 {
		return fmt.Errorf("iterations must be greater than zero")
	}
	if req.Warmup < 0 {
		return fmt.Errorf("warmup must not be negative")
	}
	if len(req.Cases) == 0 {
		return fmt.Errorf("cases must not be empty")
	}
	serialize := req.Serialize == nil || *req.Serialize
	// Decode and validate every case before measuring any workload.
	options := make([]readability.ExtractOptions, len(req.Cases))
	for i, c := range req.Cases {
		var err error
		options[i], err = readability.DecodeExtractOptions(c.Options, true)
		if err != nil {
			return fmt.Errorf("case %q: %w", c.ID, err)
		}
	}
	result := response{Cases: make([]caseResult, 0, len(req.Cases))}
	for i, c := range req.Cases {
		r := caseResult{ID: c.ID, DurationsNS: make([]int64, 0, req.Iterations), Lengths: make([]int, 0, req.Iterations), Checksums: make([]string, 0, req.Iterations), OutputBytes: make([]int, 0, req.Iterations), Statuses: make([]string, 0, req.Iterations)}
		for iteration := -req.Warmup; iteration < req.Iterations; iteration++ {
			start := time.Now()
			article, err := readability.ExtractHTML(context.Background(), c.HTML, options[i])
			if err != nil {
				return fmt.Errorf("case %q: %w", c.ID, err)
			}
			var encoded []byte
			if serialize {
				encoded, err = json.Marshal(article)
				if err != nil {
					return fmt.Errorf("case %q serialization: %w", c.ID, err)
				}
				outputSink = encoded
			} else {
				articleSink = article
			}
			elapsed := time.Since(start).Nanoseconds()
			text, status := "", "empty"
			if article != nil {
				text = article.TextContent
			}
			if text != "" {
				status = "ok"
			}
			if status == "empty" && !req.AllowEmpty {
				return fmt.Errorf("case %q produced empty extraction", c.ID)
			}
			if iteration >= 0 {
				r.DurationsNS = append(r.DurationsNS, elapsed)
				r.Lengths = append(r.Lengths, readability.UTF16Len(text))
				r.Checksums = append(r.Checksums, checksum(text))
				r.OutputBytes = append(r.OutputBytes, len(encoded))
				r.Statuses = append(r.Statuses, status)
			}
		}
		result.Cases = append(result.Cases, r)
	}
	return json.NewEncoder(output).Encode(result)
}
func main() {
	if err := run(os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "readability-kit-bench:", err)
		os.Exit(1)
	}
}
