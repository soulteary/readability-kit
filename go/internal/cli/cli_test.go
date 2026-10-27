package cli

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestArguments(t *testing.T) {
	for _, argv := range [][]string{{"x", "--url"}, {"x", "--url=a", "--url=b"}, {"--engine=bad"}, {"--format=bad"}, {"--unknown"}, {"-x"}, {"a", "b"}} {
		if _, err := parse(argv); err == nil {
			t.Errorf("accepted %q", argv)
		}
	}
	a, err := parse([]string{"--url=https://example.com", "--", "-story.html"})
	if err != nil || a.input != "-story.html" {
		t.Fatalf("%+v %v", a, err)
	}
}

func TestRunExitCodesAndPreservation(t *testing.T) {
	destination := filepath.Join(t.TempDir(), "result.json")
	if err := os.WriteFile(destination, []byte("previous"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		args []string
		want int
	}{
		{[]string{"--help"}, 0}, {[]string{"--version"}, 0}, {nil, 1},
		{[]string{"-", "--url=ftp://example.com"}, 1},
		{[]string{"-", "--url=https://example.com", "--output", destination}, 2},
	} {
		var out, diagnostic bytes.Buffer
		got := Run(context.Background(), tc.args, strings.NewReader("<html><body></body></html>"), &out, &diagnostic, "test-version")
		if got != tc.want {
			t.Fatalf("%q: exit %d want %d: %s", tc.args, got, tc.want, diagnostic.String())
		}
	}
	data, err := os.ReadFile(destination)
	if err != nil || string(data) != "previous" {
		t.Fatalf("destination changed: %s %v", data, err)
	}
}

func TestWriteOutput(t *testing.T) {
	directory := t.TempDir()
	file := filepath.Join(directory, "result")
	if err := writeOutput(file, []byte("old")); err != nil {
		t.Fatal(err)
	}
	if err := writeOutput(file, []byte("new")); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(file)
	if string(data) != "new" {
		t.Fatal(string(data))
	}
	blocked := filepath.Join(directory, "directory")
	os.Mkdir(blocked, 0700)
	if err := writeOutput(blocked, []byte("bad")); err == nil {
		t.Fatal("overwrote directory")
	}
	entries, _ := os.ReadDir(directory)
	if len(entries) != 2 {
		t.Fatalf("temporary files leaked: %v", entries)
	}
}

func TestRunExtractsStdinFormats(t *testing.T) {
	html := "<html><title>Investigation</title><body><article><p>" + strings.Repeat("Evidence explains the findings, and supports this investigation. ", 40) + "</p></article></body></html>"
	for _, format := range []string{"json", "html", "text"} {
		var output, diagnostic bytes.Buffer
		code := Run(context.Background(), []string{"-", "--url=https://example.com/story", "--format=" + format}, strings.NewReader(html), &output, &diagnostic, "test")
		if code != 0 || !strings.Contains(output.String(), "Evidence explains") || !strings.HasSuffix(output.String(), "\n") {
			t.Fatalf("format %s: exit %d output %s diagnostic %s", format, code, output.String(), diagnostic.String())
		}
	}
}
