#!/usr/bin/env bash
# Import the exact Mozilla baseline without rewriting its commit objects.
set -euo pipefail

readonly revision=d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435
readonly prefix=vendor/mozilla
cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Commit or stash tracked changes before importing upstream history.' >&2
  exit 1
fi

git fetch --no-tags https://github.com/mozilla/readability.git "$revision"

if git cat-file -e "HEAD:$prefix" 2>/dev/null; then
  git merge-base --is-ancestor "$revision" HEAD
  test "$(git rev-parse "HEAD:$prefix")" = "$(git rev-parse "$revision^{tree}")"
  echo 'The pinned Mozilla tree and its original ancestry are already present.'
  exit 0
fi

git merge --allow-unrelated-histories --strategy=ours --no-commit "$revision"
git read-tree --prefix="$prefix/" -u "$revision"
git commit -m 'Import Mozilla Readability baseline with original history' \
  -m "Upstream: https://github.com/mozilla/readability
Upstream-Commit: $revision
Import-Prefix: $prefix/

The second parent retains the original upstream commit objects and authors."

git merge-base --is-ancestor "$revision" HEAD
test "$(git rev-parse "HEAD:$prefix")" = "$(git rev-parse "$revision^{tree}")"
