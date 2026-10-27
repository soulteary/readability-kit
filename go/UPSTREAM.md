# Go port source boundaries

The authoritative source revisions and hashes are recorded in
[../upstream.json](../upstream.json). The Go implementation was adapted from:

- vendor/mozilla/Readability.js: candidate scoring, class weighting, siblings,
  candidate ancestor promotion, text threshold and output classes.
- vendor/{mozilla,chromium}/Readability-readerable.js: paragraph scoring.
- vendor/chromium/Readability.js and PATCHES.md: Chromium unlikely patterns,
  lead-image/caption discovery, recipe promotion, labels, shopping and ad-break rules.
- packages/javascript/src/cleanup.ts: semantic labels, announcement and empty-container handling.
- packages/shared/src/validation.ts and packages/shared/src/types.ts: the public option/result contract.

The native engine directly ports the locked extraction pipeline. Metadata, URL,
DOM serialization and sanitizer are native adapters. The strict repository
corpus is the measured compatibility boundary; it does not establish equivalence
for arbitrary untested documents. The original JavaScript snapshots are unchanged.

The x/net/html parser is bundled under internal/html with narrowly scoped, documented
compatibility patches; see VENDOR_PATCHES.md. Its atom package is an ordinary Go
module dependency. Update bundled sources only with the compatibility patches and
strict regression checks in place.

Keep original license notices with distributions and include the corresponding
source revision, Go module checksums and sanitizer policy version in artifacts.
