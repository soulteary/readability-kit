# Local fork provenance and limitations

This directory vendors dom_smoothie 0.18.2 from its crates.io package. Original
MIT license, source and test sources are retained. The release omits its
`test-pages` corpus. We do not substitute unrelated fixtures to make those tests
appear to pass.

The local package license expression is MIT AND Apache-2.0 to include the
engine ports; LICENSE-APACHE accompanies the original MIT LICENSE.

`upstream-fixtures` explicitly enables the eight fixture-dependent integration
test targets and five fixture-dependent library tests, after restoring the
matching upstream corpus. Fixture-free upstream library tests and `bad` tests
remain enabled by default. The ignored dependency-local bench profile was
removed. The test gates do not prove the missing upstream corpus passed.

Local adaptations:

- Config `link_density_modifier`, used during conditional cleaning.
- URL resolution delegates to url::Url (WHATWG model), including query and
  fragment handling (see url_helpers.rs).
- Config `chromium_mode`, false by default, enables selected ports of the pinned
  Chromium Readability changes. Core sets it only for the chromium engine.
- Chromium candidate matching adds shopping/shopper/retailer exclusions,
  ad-break token boundaries and recipe-family exceptions. The same policy is
  used by the instance readerability heuristic.
- Recipe-family class/id positive scores, significant-sibling promotion, lead
  image/caption scanning, JSON-LD title tie/substring selection, orphan labels,
  and nested single-image figure wrappers have native implementations.

Chromium source: chromium/src revision
`c63132a1048f364f67732370c6019ce92e8deb89`, repository files
`vendor/chromium/Readability.js` and `Readability-readerable.js`. Mozilla baseline
revision: `d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435`. See root upstream.json for
pinned hashes. The Readability engine files carry Apache-2.0 headers; the
ports retain that attribution in root LICENSES and NOTICE in addition to this
fork's MIT license. BSD-3-Clause applies to the separate Chromium integration
references, not the Apache-licensed Readability.js engine.

Focused Chromium tests live in src/chromium.rs. These tests validate isolated
changes, not complete behavior equivalence. The underlying Rust engine differs
from both JS engines in parsing, candidate selection and serialization. In
particular, some normalized content/scoring counts still use Unicode scalar
counts while JS uses UTF-16 units. Core output length is separately UTF-16.
Metadata strings may be trimmed differently. Lead image URL handling relies on
normal post-processing rather than browser native image getters. Run the strict
compatibility harness; an acknowledged difference still fails it.

Bounded metadata corrections from differential testing:

- Byline discovery skips invisible/dialog/script content and unlikely ancestor
  subtrees, preserves the selected byline's internal whitespace, and measures
  the byline cutoff using UTF-16 units. This remains an early discovery pass;
  bylines encountered only during JS fallback extraction can still differ.
- `name="article:author"` no longer overrides a real byline: the pinned JS
  accepts that namespace through `property`, not `name`. Creator priority uses
  the pinned `dcterm:creator` spelling.
- Metadata entity decoding follows the pinned JS two-pass five-name/numeric
  algorithm. Invalid numeric scalar values become U+FFFD instead of surviving
  undecoded or receiving an unrelated HTML named-entity expansion.
- Element-limit diagnostic wording matches the pinned JS error.

PR review corrections:

- Nested div/section simplification uses the single-child helper, which also
  rejects non-whitespace text siblings. Opening and closing prose survive;
  whitespace-only wrappers can still collapse and transfer their attributes.
- Responsive media URL rewriting tokenizes candidate URLs and descriptors
  without requiring a space after commas. Tabs/newlines and width/density
  descriptors work, while commas inside URL tokens are preserved. This does
  not loosen the public sanitizer's separate conservative srcset policy.
- Video attribute matching checks suffixes of a boundary-safe prefix rather
  than subtracting ASCII byte lengths inside arbitrary Unicode text. Regression
  cases include Chinese, accented characters and emoji before video domains.
- Anchor URL rewriting no longer skips values starting with the text `http`:
  relative filenames use the source base, while fragment-only links retain the
  existing source/base-dependent behavior.
- Extraction retains the selected node identity through policy and multi-attempt
  parsing rather than rediscovering a wrapper by a source-controllable ID.
  Created empty wrappers still fail extraction; internal root scores are removed.
- Table column counts saturate when untrusted colspan values exceed the total
  machine-sized count, preventing debug panics and release-mode wraparound.



## 2026-10-27 exact compatibility acceptance

The complete readability-core pipeline now passes all 604 extraction cases and
282 readerability cases with zero exact differences. The following corrections
supersede the historical gaps above for this measured corpus:

- Match fragment whitespace trimming, block successor traversal, empty transparent
  phrasing, >=3 ancestor matching and per-tag conditional cleanup order.
- Score lengths use UTF-16 and ECMAScript whitespace; title similarity follows
  JavaScript ASCII word tokenization and joined-token lengths.
- Discover bylines during candidate traversal in each retry, preserving metadata
  across attempts without changing the winning DOM's preparation order.
- Keep comments, FONT attributes and empty anchors. Simplify outer-to-inner,
  protect readability-prefixed IDs and transfer attributes in source order.
- Preserve srcset separators/descriptors verbatim, skip empty URL attributes and
  accept explicit base metadata without synthetic DOM nodes.

The public core wrapper supplies native DOMPurify policy, browser-style attribute
serialization and JSON raw/public option boundaries. The underlying vendor's
HTML helper serialization is not separately advertised as the public contract.
Tests still do not substitute for the missing upstream dom_smoothie fixture corpus.
