// SPDX-License-Identifier: Apache-2.0
package readability

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"strings"
)

// Limits optionally bounds input in addition to the engine's element limit.
// Zero leaves the corresponding budget unlimited. Context cancellation is cooperative.
type Limits struct {
	MaxInputBytes int64
	MaxDepth      int
	MaxNodes      int
}

// ExtractOptions uses pointers to distinguish omitted options from explicit zero/false.
type ExtractOptions struct {
	URL                 string   `json:"url"`
	Engine              Engine   `json:"engine,omitempty"`
	CharThreshold       *int     `json:"charThreshold,omitempty"`
	MaxElemsToParse     *int     `json:"maxElemsToParse,omitempty"`
	NbTopCandidates     *int     `json:"nbTopCandidates,omitempty"`
	KeepClasses         *bool    `json:"keepClasses,omitempty"`
	ClassesToPreserve   []string `json:"classesToPreserve,omitempty"`
	DisableJSONLD       *bool    `json:"disableJSONLD,omitempty"`
	LinkDensityModifier *float64 `json:"linkDensityModifier,omitempty"`
	Sanitize            *bool    `json:"sanitize,omitempty"`
	FlattenShadowRoots  *bool    `json:"flattenShadowRoots,omitempty"`
	Limits              Limits   `json:"-"`
}

type ReaderableOptions struct {
	Engine             Engine   `json:"engine,omitempty"`
	MinContentLength   *int     `json:"minContentLength,omitempty"`
	MinScore           *float64 `json:"minScore,omitempty"`
	FlattenShadowRoots *bool    `json:"flattenShadowRoots,omitempty"`
	Limits             Limits   `json:"-"`
}

func DefaultExtractOptions(sourceURL string) ExtractOptions { return ExtractOptions{URL: sourceURL} }
func intValue(p *int, fallback int) int {
	if p != nil {
		return *p
	}
	return fallback
}
func boolValue(p *bool, fallback bool) bool {
	if p != nil {
		return *p
	}
	return fallback
}
func floatValue(p *float64, fallback float64) float64 {
	if p != nil {
		return *p
	}
	return fallback
}
func normalizedEngine(e Engine) (Engine, error) {
	if e == "" {
		return Chromium, nil
	}
	if e != Chromium && e != Mozilla {
		return "", optionError("engine", `engine must be "chromium" or "mozilla".`)
	}
	return e, nil
}
func validateURL(s string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil || u == nil || (!strings.EqualFold(u.Scheme, "http") && !strings.EqualFold(u.Scheme, "https")) || u.Hostname() == "" {
		return nil, &Error{Code: "invalid_url", Option: "url", Message: "url must be an absolute HTTP(S) URL."}
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	if (u.Scheme == "https" && u.Port() == "443") || (u.Scheme == "http" && u.Port() == "80") {
		u.Host = strings.TrimSuffix(u.Host, ":"+u.Port())
	}
	if u.Path == "" {
		u.Path = "/"
	}
	return u, nil
}
func validateLimits(l Limits) error {
	if l.MaxInputBytes < 0 || l.MaxDepth < 0 || l.MaxNodes < 0 {
		return optionError("limits", "resource limits must be nonnegative.")
	}
	return nil
}
func validateOptions(o ExtractOptions) error {
	if _, err := normalizedEngine(o.Engine); err != nil {
		return err
	}
	if _, err := validateURL(o.URL); err != nil {
		return err
	}
	for _, v := range []struct {
		name string
		p    *int
		min  int
	}{{"charThreshold", o.CharThreshold, 1}, {"maxElemsToParse", o.MaxElemsToParse, 0}, {"nbTopCandidates", o.NbTopCandidates, 1}} {
		if v.p != nil && *v.p < v.min {
			return optionError(v.name, fmt.Sprintf("%s must be a finite integer greater than or equal to %d.", v.name, v.min))
		}
	}
	if o.LinkDensityModifier != nil && (math.IsNaN(*o.LinkDensityModifier) || math.IsInf(*o.LinkDensityModifier, 0)) {
		return optionError("linkDensityModifier", "linkDensityModifier must be a finite number.")
	}
	return validateLimits(o.Limits)
}
func validateReaderableOptions(o ReaderableOptions) error {
	if _, err := normalizedEngine(o.Engine); err != nil {
		return err
	}
	if o.MinContentLength != nil && *o.MinContentLength < 0 {
		return optionError("minContentLength", "minContentLength must be a finite integer greater than or equal to 0.")
	}
	if o.MinScore != nil && (math.IsNaN(*o.MinScore) || math.IsInf(*o.MinScore, 0) || *o.MinScore < 0) {
		return optionError("minScore", "minScore must be a finite number greater than or equal to 0.")
	}
	return validateLimits(o.Limits)
}
func checkContext(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return &Error{Code: "canceled", Message: err.Error(), Cause: err}
	}
	return nil
}
