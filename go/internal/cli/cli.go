// SPDX-License-Identifier: Apache-2.0
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	readability "github.com/soulteary/readability-kit/go"
)

const Help = `Usage: readability-kit <file|-> --url <http(s)://page-address> [options]

Extract an article from a saved HTML file or standard input.
The source URL resolves relative links; this command does not fetch pages.

Options:
  --url <url>             Source page URL (required)
  --engine <engine>       chromium (default) or mozilla
  --format <format>       json (default), html, or text
  --output <file>         Write the result to a file instead of standard output
  -h, --help              Show this help
  -v, --version           Show the package version

HTML output is sanitized by default. Input files are never executed.
Exit codes: 0 success/help, 1 invalid arguments or processing error, 2 no article.
`

type arguments struct {
	input, url, engine, format, output string
	hasInput, help, version            bool
}

func parse(argv []string) (arguments, error) {
	a := arguments{engine: "chromium", format: "json"}
	seen := map[string]bool{}
	positional := false
	for i := 0; i < len(argv); i++ {
		arg := argv[i]
		if !positional && arg == "--" {
			positional = true
			continue
		}
		if !positional && (arg == "-h" || arg == "--help") {
			a.help = true
			continue
		}
		if !positional && (arg == "-v" || arg == "--version") {
			a.version = true
			continue
		}
		if !positional && strings.HasPrefix(arg, "--") {
			name, value, equals := strings.Cut(arg, "=")
			switch name {
			case "--url", "--engine", "--format", "--output":
			default:
				return a, fmt.Errorf("Unknown option: %s. Use --help for usage.", name)
			}
			if seen[name] {
				return a, fmt.Errorf("Option %s was supplied more than once.", name)
			}
			seen[name] = true
			if !equals {
				i++
				if i < len(argv) {
					value = argv[i]
				}
			}
			if value == "" || strings.HasPrefix(value, "--") {
				return a, fmt.Errorf("Option %s requires a value.", name)
			}
			switch name {
			case "--url":
				a.url = value
			case "--output":
				a.output = value
			case "--engine":
				if value != "chromium" && value != "mozilla" {
					return a, fmt.Errorf("--engine must be chromium or mozilla.")
				}
				a.engine = value
			case "--format":
				if value != "json" && value != "html" && value != "text" {
					return a, fmt.Errorf("--format must be json, html, or text.")
				}
				a.format = value
			}
			continue
		}
		if !positional && arg != "-" && strings.HasPrefix(arg, "-") {
			return a, fmt.Errorf("Unknown option: %s. Use -- before a filename beginning with a dash.", arg)
		}
		if a.hasInput {
			return a, fmt.Errorf("Supply one HTML file, or - to read standard input.")
		}
		a.input = arg
		a.hasInput = true
	}
	return a, nil
}

// Run executes one CLI invocation; all diagnostics go to stderr.
func Run(ctx context.Context, argv []string, stdin io.Reader, stdout, stderr io.Writer, version string) int {
	code, err := run(ctx, argv, stdin, stdout, stderr, version)
	if err != nil {
		fmt.Fprintf(stderr, "readability-kit: %s\n", err)
		return 1
	}
	return code
}

func run(ctx context.Context, argv []string, stdin io.Reader, stdout, stderr io.Writer, version string) (int, error) {
	a, err := parse(argv)
	if err != nil {
		return 1, err
	}
	if a.help {
		_, err = io.WriteString(stdout, Help)
		return 0, err
	}
	if a.version {
		_, err = fmt.Fprintln(stdout, version)
		return 0, err
	}
	if !a.hasInput {
		return 1, fmt.Errorf("Supply an HTML file, or - to read standard input. Use --help for usage.")
	}
	if a.url == "" {
		return 1, fmt.Errorf("--url is required so relative links resolve correctly.")
	}
	u, err := url.Parse(a.url)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return 1, fmt.Errorf("--url must be an absolute http:// or https:// URL.")
	}
	var html []byte
	if a.input == "-" {
		html, err = io.ReadAll(stdin)
	} else {
		html, err = os.ReadFile(a.input)
	}
	if err != nil {
		return 1, err
	}
	raw, _ := json.Marshal(map[string]any{"url": u.String(), "engine": a.engine})
	opts, err := readability.DecodeExtractOptions(raw, true)
	if err != nil {
		return 1, err
	}
	article, err := readability.ExtractHTML(ctx, string(html), opts)
	if err != nil {
		return 1, err
	}
	if article == nil {
		_, err = io.WriteString(stderr, "readability-kit: No article was found in this input.\n")
		return 2, err
	}
	var output []byte
	switch a.format {
	case "html":
		output = []byte(article.Content)
	case "text":
		output = []byte(article.TextContent)
	default:
		output, err = json.MarshalIndent(article, "", "  ")
	}
	if err != nil {
		return 1, err
	}
	if len(output) == 0 || output[len(output)-1] != '\n' {
		output = append(output, '\n')
	}
	if a.output != "" {
		err = writeOutput(a.output, output)
	} else {
		_, err = stdout.Write(output)
	}
	return 0, err
}

// The temporary file is created beside the destination so replacement remains on
// one filesystem. Rename failure never removes an existing destination.
func writeOutput(filename string, output []byte) error {
	destination, err := filepath.Abs(filename)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(destination), ".readability-kit-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(output); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(name, destination)
}
