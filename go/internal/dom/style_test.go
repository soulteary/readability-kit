// SPDX-License-Identifier: Apache-2.0
package dom

import "testing"

// Expected values are pinned to jsdom 30.1.3 CSSStyleDeclaration, which is used
// by the JavaScript differential reference (including first-important behavior).
func TestInlineDisplayCascade(t *testing.T) {
	for _, tt := range []struct {
		style  string
		hidden bool
	}{
		{"display:none;display:block", false},
		{"display:block;display:none", true},
		{"display:none!important;display:block", true},
		{"display:none!important;display:block!important", true},
		{"display:block!important;display:none!important", false},
		{"display:none;display:block!important", false},
		{"display:none;display:invalid", true},
		{"display:none;display:", true},
		{"display: none /* comment */", true},
		{"display:/* comment */none", true},
		{"display:n/**/one", false},
		{"DISPLAY:NONE", false},
		{"display:nOnE", true},
		{"display:\n\tnone", true},
		{"--x:display:none", false},
		{`background:url("display:none;");display:block`, false},
		{"display:none;display:var(--mode)", false},
		{"display:none;display:xvar(--x)", true},
		{"display:none;display:VAR(--x)", true},
		{"display:none;display:'var(--x)'", true},
		{"display:none;display:calc(var(--x))", false},
		{"display:none;display:none,var(--x)", true},
		{"display:none;display:inline flow", false},
		{"display:none;display:banana block", true},
	} {
		t.Run(tt.style, func(t *testing.T) {
			if got := displayNone(tt.style); got != tt.hidden {
				t.Fatalf("hidden = %v, want %v", got, tt.hidden)
			}
		})
	}
}
