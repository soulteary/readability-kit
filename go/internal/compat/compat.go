// SPDX-License-Identifier: Apache-2.0
package compat

import (
	"context"
	"encoding/json"
	"fmt"
	readability "github.com/soulteary/readability-kit/go"
	"io"
)

type envelope struct {
	Status  string `json:"status"`
	Article any    `json:"article"`
	Error   string `json:"error,omitempty"`
}

// Run implements the single-request JSON compatibility transport. Semantic
// errors are JSON envelopes with a successful process exit.
func Run(ctx context.Context, input io.Reader, output io.Writer) error {
	result := evaluate(ctx, input)
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(result)
}

func evaluate(ctx context.Context, input io.Reader) envelope {
	failure := func(err error) envelope { return envelope{Status: "error", Error: err.Error()} }
	var request struct {
		HTML    *string         `json:"html"`
		Options json.RawMessage `json:"options"`
		Layer   string          `json:"layer"`
	}
	decoder := json.NewDecoder(input)
	if err := decoder.Decode(&request); err != nil {
		return failure(err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return failure(fmt.Errorf("Expected one JSON request."))
	}
	if request.HTML == nil {
		return failure(fmt.Errorf("html must be a string."))
	}
	if request.Layer == "" {
		request.Layer = "api"
	}
	var article any
	if request.Layer == "readerable" {
		opts, err := readability.DecodeReaderableOptions(request.Options)
		if err != nil {
			return failure(err)
		}
		value, err := readability.IsProbablyReaderable(ctx, *request.HTML, opts)
		if err != nil {
			return failure(err)
		}
		article = value
	} else {
		if request.Layer != "api" && request.Layer != "raw" {
			return failure(fmt.Errorf("Unsupported layer: %s", request.Layer))
		}
		opts, err := readability.DecodeExtractOptions(request.Options, request.Layer == "api")
		if err != nil {
			return failure(err)
		}
		var value *readability.Article
		if request.Layer == "raw" {
			value, err = readability.ExtractRawHTML(ctx, *request.HTML, opts)
		} else {
			value, err = readability.ExtractHTML(ctx, *request.HTML, opts)
		}
		if err != nil {
			return failure(err)
		}
		if value == nil {
			return envelope{Status: "empty"}
		}
		article = value
		if request.Layer == "raw" {
			// JavaScript JSON serialization omits undefined upstream fields.
			data, err := json.Marshal(value)
			if err != nil {
				return failure(err)
			}
			var fields map[string]any
			if err := json.Unmarshal(data, &fields); err != nil {
				return failure(err)
			}
			delete(fields, "url")
			delete(fields, "engine")
			if value.Excerpt == nil {
				delete(fields, "excerpt")
			}
			article = fields
		}
	}
	return envelope{Status: "ok", Article: article}
}
