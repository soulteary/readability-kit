// SPDX-License-Identifier: Apache-2.0
package readability

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/url"
	"strconv"
	"strings"
)

func optionObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	if len(raw) == 0 {
		raw = []byte("{}")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return nil, optionError("options", "options must be an object.")
	}
	return obj, nil
}
func decodeEngine(obj map[string]json.RawMessage) (Engine, error) {
	raw, ok := obj["engine"]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return Chromium, nil
	}
	var e Engine
	if err := json.Unmarshal(raw, &e); err != nil || (e != Chromium && e != Mozilla) {
		return "", optionError("engine", `engine must be "chromium" or "mozilla".`)
	}
	return e, nil
}
func decodeBool(obj map[string]json.RawMessage, name string) (*bool, error) {
	raw, ok := obj[name]
	if !ok {
		return nil, nil
	}
	var v bool
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || json.Unmarshal(raw, &v) != nil {
		return nil, optionError(name, name+" must be a boolean.")
	}
	return &v, nil
}
func decodeNumber(obj map[string]json.RawMessage, name string, min *float64, integer bool) (*float64, error) {
	raw, ok := obj[name]
	if !ok {
		return nil, nil
	}
	var v any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	err := decoder.Decode(&v)
	num, isNumber := v.(json.Number)
	f, parseErr := num.Float64()
	if err != nil || !isNumber || parseErr != nil || math.IsNaN(f) || math.IsInf(f, 0) || (integer && math.Trunc(f) != f) || (min != nil && f < *min) || (integer && f > 9007199254740991) {
		kind := "number"
		if integer {
			kind = "integer"
		}
		message := fmt.Sprintf("%s must be a finite %s", name, kind)
		if min != nil {
			message += fmt.Sprintf(" greater than or equal to %g", *min)
		}
		return nil, optionError(name, message+".")
	}
	return &f, nil
}
func decodeInt(obj map[string]json.RawMessage, name string, min float64) (*int, error) {
	p, err := decodeNumber(obj, name, &min, true)
	if err != nil || p == nil {
		return nil, err
	}
	v := int(*p)
	if float64(v) != *p {
		return nil, optionError(name, name+" exceeds the native integer range.")
	}
	return &v, nil
}

// DecodeExtractOptions applies the JavaScript public option contract at the JSON
// boundary. The raw adapter accepts the upstream zero-threshold defaults but is
// otherwise typed; raw coercion differences remain part of the preview report.
func DecodeExtractOptions(raw json.RawMessage, public bool) (ExtractOptions, error) {
	var o ExtractOptions
	obj, err := optionObject(raw)
	if err != nil {
		return o, err
	}
	if !public {
		return decodeRawOptions(obj)
	}
	// The Node adapter validates the source URL before common extraction options.
	urlRaw, ok := obj["url"]
	if !ok {
		return o, &Error{Code: "invalid_url", Option: "url", Message: "url must be an absolute HTTP(S) URL."}
	}
	if json.Unmarshal(urlRaw, &o.URL) != nil || o.URL == "" {
		return o, &Error{Code: "invalid_url", Option: "url", Message: "url must be an absolute HTTP(S) URL."}
	}
	if _, err = validateURL(o.URL); err != nil {
		return o, err
	}
	if o.Engine, err = decodeEngine(obj); err != nil {
		return o, err
	}
	if o.FlattenShadowRoots, err = decodeBool(obj, "flattenShadowRoots"); err != nil {
		return o, err
	}
	thresholdMin := float64(1)
	if !public {
		thresholdMin = 0
	}
	if o.CharThreshold, err = decodeInt(obj, "charThreshold", thresholdMin); err != nil {
		return o, err
	}
	if o.MaxElemsToParse, err = decodeInt(obj, "maxElemsToParse", 0); err != nil {
		return o, err
	}
	candidateMin := float64(1)
	if !public {
		candidateMin = 0
	}
	if o.NbTopCandidates, err = decodeInt(obj, "nbTopCandidates", candidateMin); err != nil {
		return o, err
	}
	if o.LinkDensityModifier, err = decodeNumber(obj, "linkDensityModifier", nil, false); err != nil {
		return o, err
	}
	if o.KeepClasses, err = decodeBool(obj, "keepClasses"); err != nil {
		return o, err
	}
	if o.DisableJSONLD, err = decodeBool(obj, "disableJSONLD"); err != nil {
		return o, err
	}
	if o.Sanitize, err = decodeBool(obj, "sanitize"); err != nil {
		return o, err
	}
	if classes, ok := obj["classesToPreserve"]; ok {
		var a []json.RawMessage
		if bytes.Equal(bytes.TrimSpace(classes), []byte("null")) || json.Unmarshal(classes, &a) != nil {
			return o, optionError("classesToPreserve", "classesToPreserve must be an array of strings.")
		}
		o.ClassesToPreserve = make([]string, len(a))
		for i, item := range a {
			if bytes.Equal(bytes.TrimSpace(item), []byte("null")) || json.Unmarshal(item, &o.ClassesToPreserve[i]) != nil {
				return o, optionError("classesToPreserve", "classesToPreserve must be an array of strings.")
			}
		}
	}
	return o, nil
}

// DecodeReaderableOptions keeps explicit null distinct from an omitted value.
func DecodeReaderableOptions(raw json.RawMessage) (ReaderableOptions, error) {
	var o ReaderableOptions
	obj, err := optionObject(raw)
	if err != nil {
		return o, err
	}
	if o.Engine, err = decodeEngine(obj); err != nil {
		return o, err
	}
	if o.FlattenShadowRoots, err = decodeBool(obj, "flattenShadowRoots"); err != nil {
		return o, err
	}
	if o.MinContentLength, err = decodeInt(obj, "minContentLength", 0); err != nil {
		return o, err
	}
	zero := float64(0)
	if o.MinScore, err = decodeNumber(obj, "minScore", &zero, false); err != nil {
		return o, err
	}
	return o, nil
}

// DecodeJSONRequest decodes exactly one JSON document. It is useful to adapters
// that must reject trailing protocol data rather than silently ignore it.
func DecodeJSONRequest(r io.Reader, target any) error {
	d := json.NewDecoder(r)
	if err := d.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("expected one JSON request")
		}
		return err
	}
	return nil
}

// decodeRawOptions mirrors Readability constructor defaults, which use JS ||
// coercion and do not apply the public wrapper's validation to unused fields.
func decodeRawOptions(obj map[string]json.RawMessage) (ExtractOptions, error) {
	var o ExtractOptions
	o.Engine, _ = decodeEngine(obj)
	if o.Engine == "" {
		o.Engine = Chromium
	}
	if raw, ok := obj["url"]; ok {
		_ = json.Unmarshal(raw, &o.URL)
	} else {
		o.URL = "about:blank"
	}
	if u, err := url.Parse(o.URL); err != nil || u.Scheme == "" {
		return o, optionError("url", "Invalid URL: "+o.URL)
	}
	val := func(name string) any {
		var v any
		d := json.NewDecoder(bytes.NewReader(obj[name]))
		d.UseNumber()
		_ = d.Decode(&v)
		return v
	}
	truth := func(v any) bool {
		switch x := v.(type) {
		case nil:
			return false
		case bool:
			return x
		case string:
			return x != ""
		case json.Number:
			f, _ := x.Float64()
			return f != 0 && !math.IsNaN(f)
		default:
			return true
		}
	}
	number := func(v any) float64 {
		switch x := v.(type) {
		case nil:
			return 0
		case bool:
			if x {
				return 1
			}
			return 0
		case json.Number:
			f, _ := x.Float64()
			return f
		case string:
			f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
			if err != nil {
				return math.NaN()
			}
			return f
		default:
			return math.NaN()
		}
	}
	integer := func(name string, ceil bool) *int {
		v := val(name)
		if !truth(v) {
			return nil
		}
		f := number(v)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return nil
		}
		if ceil {
			f = math.Ceil(f)
		} else {
			f = math.Floor(f)
		}
		n := int(f)
		return &n
	}
	o.CharThreshold = integer("charThreshold", true)
	o.MaxElemsToParse = integer("maxElemsToParse", false)
	o.NbTopCandidates = integer("nbTopCandidates", true)
	if v := val("linkDensityModifier"); truth(v) {
		f := number(v)
		o.LinkDensityModifier = &f
	}
	for name, dst := range map[string]**bool{"keepClasses": &o.KeepClasses, "disableJSONLD": &o.DisableJSONLD} {
		if v, ok := obj[name]; ok {
			_ = v
			b := truth(val(name))
			*dst = &b
		}
	}
	if v := val("classesToPreserve"); truth(v) {
		switch x := v.(type) {
		case []any:
			for _, c := range x {
				if s, ok := c.(string); ok {
					o.ClassesToPreserve = append(o.ClassesToPreserve, s)
				}
			}
		case string:
			o.ClassesToPreserve = []string{x}
		}
	}
	return o, nil
}
