// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"fmt"
	"github.com/soulteary/readability-kit/go/internal/compat"
	"os"
)

func main() {
	if err := compat.Run(context.Background(), os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
