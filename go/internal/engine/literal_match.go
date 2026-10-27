// SPDX-License-Identifier: Apache-2.0
package engine

import (
	"regexp"
	"strings"
)

// literalMatcher accelerates the ASCII subset of a case-insensitive literal
// alternation. Other patterns and all non-ASCII inputs keep regexp semantics.
// The latter includes Unicode simple folds such as long s and Kelvin sign.
type literalMatcher struct {
	original    *regexp.Regexp
	transitions [][128]uint16
	accepts     []bool
	anchored    [][]literalAnchor
}
type literalAnchor struct {
	length     int
	start, end bool
}

func compileLiteralMatcher(pattern string) *literalMatcher {
	m := &literalMatcher{original: regexp.MustCompile(pattern)}
	if !strings.HasPrefix(pattern, "(?i)") {
		return m
	}
	m.transitions = append(m.transitions, [128]uint16{})
	m.accepts = append(m.accepts, false)
	m.anchored = append(m.anchored, nil)
	for _, alternative := range strings.Split(pattern[4:], "|") {
		start, end := strings.HasPrefix(alternative, "^"), strings.HasSuffix(alternative, "$")
		literal := strings.TrimSuffix(strings.TrimPrefix(alternative, "^"), "$")
		if literal == "" || strings.ContainsAny(literal, `\.*+?()[]{}|^$`) {
			m.transitions = nil
			return m
		}
		state := uint16(0)
		for i := 0; i < len(literal); i++ {
			c := literal[i]
			if c >= 128 {
				m.transitions = nil
				return m
			}
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			next := m.transitions[state][c]
			if next == 0 {
				if len(m.transitions) >= 65535 {
					m.transitions = nil
					return m
				}
				next = uint16(len(m.transitions))
				m.transitions = append(m.transitions, [128]uint16{})
				m.accepts = append(m.accepts, false)
				m.anchored = append(m.anchored, nil)
				m.transitions[state][c] = next
			}
			state = next
		}
		if !start && !end {
			m.accepts[state] = true
		} else {
			m.anchored[state] = append(m.anchored[state], literalAnchor{len(literal), start, end})
		}
	}
	failures := make([]uint16, len(m.transitions))
	queue := make([]uint16, 0, len(m.transitions))
	for _, next := range m.transitions[0] {
		if next != 0 {
			queue = append(queue, next)
		}
	}
	for head := 0; head < len(queue); head++ {
		state := queue[head]
		for c := 0; c < 128; c++ {
			next := m.transitions[state][c]
			if next == 0 {
				m.transitions[state][c] = m.transitions[failures[state]][c]
				continue
			}
			failures[next] = m.transitions[failures[state]][c]
			m.accepts[next] = m.accepts[next] || m.accepts[failures[next]]
			m.anchored[next] = append(m.anchored[next], m.anchored[failures[next]]...)
			queue = append(queue, next)
		}
	}
	return m
}

func (m *literalMatcher) MatchString(s string) bool {
	if m.transitions == nil {
		return m.original.MatchString(s)
	}
	for i := 0; i < len(s); i++ {
		if s[i] >= 128 {
			return m.original.MatchString(s)
		}
	}
	state := uint16(0)
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		state = m.transitions[state][c]
		if m.accepts[state] {
			return true
		}
		for _, anchor := range m.anchored[state] {
			if (!anchor.start || i+1 == anchor.length) && (!anchor.end || i+1 == len(s)) {
				return true
			}
		}
	}
	return false
}
