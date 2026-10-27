// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"github.com/soulteary/readability-kit/go/internal/cli"
	"os"
)

var version = "0.1.0"

func main() {
	os.Exit(cli.Run(context.Background(), os.Args[1:], os.Stdin, os.Stdout, os.Stderr, version))
}
