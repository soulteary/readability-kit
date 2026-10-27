// SPDX-License-Identifier: Apache-2.0
package readability

// Error is a classified failure; an empty extraction is returned without an error.
type Error struct {
	Code    string
	Option  string
	Message string
	Cause   error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Cause }
func optionError(option, message string) error {
	return &Error{Code: "invalid_option", Option: option, Message: message}
}
