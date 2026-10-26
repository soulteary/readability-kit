# Raw upstream engine comparison

This report compares the pinned Mozilla Readability engine with Chromium's modified engine on the original Mozilla HTML fixture corpus. It records behavior rather than assigning quality scores. A longer result, a shorter result, or changed HTML is not evidence that either engine is more accurate.

## Reproduce

```bash
npm ci
npm run compare -- --output comparison.json
npm run compare -- --check
```

Without arguments, `npm run compare` prints the complete JSON report. `--output` writes that report to a file and prints a compact summary. `--check` exits with failure if the corpus is empty or either engine throws, returns no article, returns invalid fields, or returns empty HTML/text. Differences between valid articles do not fail the check. The options can be combined.

The tool calls the raw vendored constructors directly. Run `npm run test:upstream` separately for Mozilla's original expected-output assertions. This comparison does not replace those assertions and does not call the public package wrapper.

## Recorded environment

| Item | Value |
| --- | --- |
| JSON report timestamp | `2026-10-26T09:32:36.289Z` |
| Node.js | `24.22.1` |
| jsdom | `30.1.3` |
| Mozilla revision | [`d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435`](https://github.com/mozilla/readability/tree/d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435) |
| Chromium revision | [`c63132a1048f364f67732370c6019ce92e8deb89`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/) |
| Mozilla engine SHA-256 | `e9330028c8a5a4aa7d75147be2605d520f7f213c7b28474947dc0e9c984e9bed` |
| Chromium engine SHA-256 | `fe8839ead0d470bd8b074b4bbbfd41f23a81f31adb2f948a8bf80ff3344cbc2a` |
| Source URL for every document | `https://example.com/test/page.html` |

## Results

| Measurement | Count |
| --- | ---: |
| Original source fixtures | 130 |
| Successful nonempty articles, Mozilla | 130 |
| Successful nonempty articles, Chromium | 130 |
| Fixtures matching all compared fields | 99 |
| Fixtures with at least one difference | 31 |
| Different title | 0 |
| Different normalized text | 21 |
| Different raw HTML SHA-256 | 31 |
| Different raw engine-reported length | 27 |
| Different `excerpt` | 0 |
| Different `byline` | 0 |
| Different `lang` | 0 |
| Different `dir` | 0 |
| Different `siteName` | 0 |
| Different `publishedTime` | 0 |
| Mozilla: exceptions / empty / invalid results | 0 / 0 / 0 |
| Mozilla: non-CSS jsdom diagnostics | 0 |
| Mozilla: suppressed CSS parsing warnings | 63 |
| Chromium: exceptions / empty / invalid results | 0 / 0 / 0 |
| Chromium: non-CSS jsdom diagnostics | 0 |
| Chromium: suppressed CSS parsing warnings | 63 |

All fixtures were comparable in this recorded run, and `--check` exited successfully. Field counts overlap: a fixture with changed text can also have changed HTML and length. An HTML hash difference can arise from formatting, attributes, images, or article structure even when normalized text is unchanged.

## Method and limits

- Enumerate every `vendor/mozilla/test/test-pages/*/source.html` in ascending fixture-name order. Fixture names are discovered from the imported corpus; the tool does not assume a fixed count.
- Parse the exact same source bytes into a fresh jsdom document for each engine, with the same fixed source URL and upstream default engine options.
- Keep page-script execution and remote resource loading disabled. Close each jsdom window immediately after capturing its engine result.
- Compare titles and metadata exactly, representing absent metadata as `null`. Normalize only article text by collapsing each Unicode whitespace run to one space and trimming the ends.
- Hash the raw serialized `article.content` with SHA-256. This is exact serialized HTML comparison, not DOM equivalence or a semantic quality metric.
- Preserve the engine's original `length` separately from normalized-text length. Both length figures use JavaScript string units; they are not word counts.
- Suppress CSS parsing warnings from historical fixtures, recording their count. Retain all other jsdom diagnostics in the JSON report.

The full JSON contains source-file hashes, engine hashes, both normalized texts, metadata, lengths, per-field difference flags, and diagnostics for every fixture. The package's open-shadow-root cloning, semantic cleanup, DOMPurify sanitization, output normalization, and browser presentation are outside this measurement. These static HTML fixtures also do not reproduce page scripts or runtime-created shadow trees.

This corpus comes from Mozilla regression tests. It is useful for observing changes against the retained baseline, but it is not a representative, independently scored benchmark of current websites or languages. No extracted article content was manually judged as part of this report.

## Fixtures with differences

The fixture links point to the original saved inputs. Length pairs are **Mozilla / Chromium**. Metadata fields other than raw `length` were identical across every fixture in this run.

| Fixture | Title | Normalized text | Raw HTML | Raw reported length | Normalized text length |
| --- | --- | --- | --- | ---: | ---: |
| [aktualne](../vendor/mozilla/test/test-pages/aktualne/source.html) | Same | Different | Different | 6547 / 6701 | 4598 / 4666 |
| [archive-of-our-own](../vendor/mozilla/test/test-pages/archive-of-our-own/source.html) | Same | Different | Different | 31086 / 31292 | 22245 / 22278 |
| [ars-1](../vendor/mozilla/test/test-pages/ars-1/source.html) | Same | Different | Different | 5947 / 6292 | 3527 / 3700 |
| [breitbart](../vendor/mozilla/test/test-pages/breitbart/source.html) | Same | Different | Different | 2051 / 1776 | 1792 / 1773 |
| [citylab-1](../vendor/mozilla/test/test-pages/citylab-1/source.html) | Same | Different | Different | 12823 / 12778 | 9481 / 9435 |
| [cnet-svg-classes](../vendor/mozilla/test/test-pages/cnet-svg-classes/source.html) | Same | Same | Different | 1706 / 2112 | 1469 / 1469 |
| [cnn](../vendor/mozilla/test/test-pages/cnn/source.html) | Same | Same | Different | 2432 / 2586 | 2022 / 2022 |
| [dropbox-blog](../vendor/mozilla/test/test-pages/dropbox-blog/source.html) | Same | Different | Different | 33326 / 33364 | 18424 / 18463 |
| [heise](../vendor/mozilla/test/test-pages/heise/source.html) | Same | Different | Different | 1915 / 2016 | 1746 / 1824 |
| [hukumusume](../vendor/mozilla/test/test-pages/hukumusume/source.html) | Same | Different | Different | 9768 / 10489 | 920 / 939 |
| [iab-1](../vendor/mozilla/test/test-pages/iab-1/source.html) | Same | Same | Different | 5790 / 5790 | 5790 / 5790 |
| [keep-images](../vendor/mozilla/test/test-pages/keep-images/source.html) | Same | Same | Different | 35442 / 35489 | 19086 / 19086 |
| [lazy-image-1](../vendor/mozilla/test/test-pages/lazy-image-1/source.html) | Same | Different | Different | 17925 / 17934 | 9135 / 9143 |
| [liberation-1](../vendor/mozilla/test/test-pages/liberation-1/source.html) | Same | Same | Different | 2073 / 2073 | 1768 / 1768 |
| [mozilla-2](../vendor/mozilla/test/test-pages/mozilla-2/source.html) | Same | Different | Different | 2491 / 2539 | 1665 / 1673 |
| [msn](../vendor/mozilla/test/test-pages/msn/source.html) | Same | Different | Different | 1983 / 2031 | 1549 / 1597 |
| [nytimes-3](../vendor/mozilla/test/test-pages/nytimes-3/source.html) | Same | Same | Different | 17288 / 17288 | 9745 / 9745 |
| [nytimes-4](../vendor/mozilla/test/test-pages/nytimes-4/source.html) | Same | Same | Different | 16405 / 16405 | 9993 / 9993 |
| [qq](../vendor/mozilla/test/test-pages/qq/source.html) | Same | Different | Different | 834 / 838 | 742 / 746 |
| [quanta-1](../vendor/mozilla/test/test-pages/quanta-1/source.html) | Same | Same | Different | 23486 / 23564 | 18425 / 18425 |
| [remove-aria-hidden](../vendor/mozilla/test/test-pages/remove-aria-hidden/source.html) | Same | Different | Different | 251 / 273 | 231 / 237 |
| [seattletimes-1](../vendor/mozilla/test/test-pages/seattletimes-1/source.html) | Same | Different | Different | 16276 / 16328 | 12483 / 12534 |
| [spiceworks](../vendor/mozilla/test/test-pages/spiceworks/source.html) | Same | Same | Different | 6408 / 6896 | 4703 / 4703 |
| [telegraph](../vendor/mozilla/test/test-pages/telegraph/source.html) | Same | Different | Different | 2968 / 3237 | 2968 / 3186 |
| [topicseed-1](../vendor/mozilla/test/test-pages/topicseed-1/source.html) | Same | Different | Different | 11290 / 11595 | 8473 / 8700 |
| [videos-1](../vendor/mozilla/test/test-pages/videos-1/source.html) | Same | Different | Different | 24686 / 24706 | 20062 / 20083 |
| [videos-2](../vendor/mozilla/test/test-pages/videos-2/source.html) | Same | Different | Different | 11545 / 11712 | 9122 / 9183 |
| [visibility-hidden](../vendor/mozilla/test/test-pages/visibility-hidden/source.html) | Same | Different | Different | 396 / 427 | 372 / 382 |
| [webmd-1](../vendor/mozilla/test/test-pages/webmd-1/source.html) | Same | Different | Different | 3444 / 3453 | 2240 / 2249 |
| [webmd-2](../vendor/mozilla/test/test-pages/webmd-2/source.html) | Same | Different | Different | 2418 / 2452 | 2418 / 2452 |
| [wikipedia-2](../vendor/mozilla/test/test-pages/wikipedia-2/source.html) | Same | Same | Different | 219209 / 219210 | 117620 / 117620 |

## Fixtures matching every compared field

The remaining 99 fixtures matched title, normalized text, raw HTML hash, raw length, and all listed metadata fields:

- [001](../vendor/mozilla/test/test-pages/001/source.html)
- [002](../vendor/mozilla/test/test-pages/002/source.html)
- [003-metadata-preferred](../vendor/mozilla/test/test-pages/003-metadata-preferred/source.html)
- [004-metadata-space-separated-properties](../vendor/mozilla/test/test-pages/004-metadata-space-separated-properties/source.html)
- [005-unescape-html-entities](../vendor/mozilla/test/test-pages/005-unescape-html-entities/source.html)
- [aclu](../vendor/mozilla/test/test-pages/aclu/source.html)
- [article-author-tag](../vendor/mozilla/test/test-pages/article-author-tag/source.html)
- [base-url](../vendor/mozilla/test/test-pages/base-url/source.html)
- [base-url-base-element](../vendor/mozilla/test/test-pages/base-url-base-element/source.html)
- [base-url-base-element-relative](../vendor/mozilla/test/test-pages/base-url-base-element-relative/source.html)
- [basic-tags-cleaning](../vendor/mozilla/test/test-pages/basic-tags-cleaning/source.html)
- [bbc-1](../vendor/mozilla/test/test-pages/bbc-1/source.html)
- [blogger](../vendor/mozilla/test/test-pages/blogger/source.html)
- [bug-1255978](../vendor/mozilla/test/test-pages/bug-1255978/source.html)
- [buzzfeed-1](../vendor/mozilla/test/test-pages/buzzfeed-1/source.html)
- [clean-links](../vendor/mozilla/test/test-pages/clean-links/source.html)
- [cnet](../vendor/mozilla/test/test-pages/cnet/source.html)
- [comment-inside-script-parsing](../vendor/mozilla/test/test-pages/comment-inside-script-parsing/source.html)
- [daringfireball-1](../vendor/mozilla/test/test-pages/daringfireball-1/source.html)
- [data-url-image](../vendor/mozilla/test/test-pages/data-url-image/source.html)
- [dev418](../vendor/mozilla/test/test-pages/dev418/source.html)
- [ebb-org](../vendor/mozilla/test/test-pages/ebb-org/source.html)
- [ehow-1](../vendor/mozilla/test/test-pages/ehow-1/source.html)
- [ehow-2](../vendor/mozilla/test/test-pages/ehow-2/source.html)
- [embedded-videos](../vendor/mozilla/test/test-pages/embedded-videos/source.html)
- [engadget](../vendor/mozilla/test/test-pages/engadget/source.html)
- [firefox-nightly-blog](../vendor/mozilla/test/test-pages/firefox-nightly-blog/source.html)
- [folha](../vendor/mozilla/test/test-pages/folha/source.html)
- [gitlab-blog](../vendor/mozilla/test/test-pages/gitlab-blog/source.html)
- [gmw](../vendor/mozilla/test/test-pages/gmw/source.html)
- [google-sre-book-1](../vendor/mozilla/test/test-pages/google-sre-book-1/source.html)
- [guardian-1](../vendor/mozilla/test/test-pages/guardian-1/source.html)
- [herald-sun-1](../vendor/mozilla/test/test-pages/herald-sun-1/source.html)
- [hidden-nodes](../vendor/mozilla/test/test-pages/hidden-nodes/source.html)
- [ietf-1](../vendor/mozilla/test/test-pages/ietf-1/source.html)
- [invalid-attributes](../vendor/mozilla/test/test-pages/invalid-attributes/source.html)
- [js-link-replacement](../vendor/mozilla/test/test-pages/js-link-replacement/source.html)
- [keep-tabular-data](../vendor/mozilla/test/test-pages/keep-tabular-data/source.html)
- [la-nacion](../vendor/mozilla/test/test-pages/la-nacion/source.html)
- [lazy-image-2](../vendor/mozilla/test/test-pages/lazy-image-2/source.html)
- [lazy-image-3](../vendor/mozilla/test/test-pages/lazy-image-3/source.html)
- [lemonde-1](../vendor/mozilla/test/test-pages/lemonde-1/source.html)
- [lifehacker-post-comment-load](../vendor/mozilla/test/test-pages/lifehacker-post-comment-load/source.html)
- [lifehacker-working](../vendor/mozilla/test/test-pages/lifehacker-working/source.html)
- [links-in-tables](../vendor/mozilla/test/test-pages/links-in-tables/source.html)
- [lwn-1](../vendor/mozilla/test/test-pages/lwn-1/source.html)
- [mathjax](../vendor/mozilla/test/test-pages/mathjax/source.html)
- [medicalnewstoday](../vendor/mozilla/test/test-pages/medicalnewstoday/source.html)
- [medium-1](../vendor/mozilla/test/test-pages/medium-1/source.html)
- [medium-2](../vendor/mozilla/test/test-pages/medium-2/source.html)
- [medium-3](../vendor/mozilla/test/test-pages/medium-3/source.html)
- [mercurial](../vendor/mozilla/test/test-pages/mercurial/source.html)
- [metadata-content-missing](../vendor/mozilla/test/test-pages/metadata-content-missing/source.html)
- [missing-paragraphs](../vendor/mozilla/test/test-pages/missing-paragraphs/source.html)
- [mozilla-1](../vendor/mozilla/test/test-pages/mozilla-1/source.html)
- [normalize-spaces](../vendor/mozilla/test/test-pages/normalize-spaces/source.html)
- [nytimes-1](../vendor/mozilla/test/test-pages/nytimes-1/source.html)
- [nytimes-2](../vendor/mozilla/test/test-pages/nytimes-2/source.html)
- [nytimes-5](../vendor/mozilla/test/test-pages/nytimes-5/source.html)
- [ol](../vendor/mozilla/test/test-pages/ol/source.html)
- [parsely-metadata](../vendor/mozilla/test/test-pages/parsely-metadata/source.html)
- [pixnet](../vendor/mozilla/test/test-pages/pixnet/source.html)
- [remove-extra-brs](../vendor/mozilla/test/test-pages/remove-extra-brs/source.html)
- [remove-extra-paragraphs](../vendor/mozilla/test/test-pages/remove-extra-paragraphs/source.html)
- [remove-script-tags](../vendor/mozilla/test/test-pages/remove-script-tags/source.html)
- [reordering-paragraphs](../vendor/mozilla/test/test-pages/reordering-paragraphs/source.html)
- [replace-brs](../vendor/mozilla/test/test-pages/replace-brs/source.html)
- [replace-font-tags](../vendor/mozilla/test/test-pages/replace-font-tags/source.html)
- [royal-road](../vendor/mozilla/test/test-pages/royal-road/source.html)
- [rtl-1](../vendor/mozilla/test/test-pages/rtl-1/source.html)
- [rtl-2](../vendor/mozilla/test/test-pages/rtl-2/source.html)
- [rtl-3](../vendor/mozilla/test/test-pages/rtl-3/source.html)
- [rtl-4](../vendor/mozilla/test/test-pages/rtl-4/source.html)
- [salon-1](../vendor/mozilla/test/test-pages/salon-1/source.html)
- [schema-org-context-object](../vendor/mozilla/test/test-pages/schema-org-context-object/source.html)
- [simplyfound-1](../vendor/mozilla/test/test-pages/simplyfound-1/source.html)
- [social-buttons](../vendor/mozilla/test/test-pages/social-buttons/source.html)
- [style-tags-removal](../vendor/mozilla/test/test-pages/style-tags-removal/source.html)
- [svg-parsing](../vendor/mozilla/test/test-pages/svg-parsing/source.html)
- [table-style-attributes](../vendor/mozilla/test/test-pages/table-style-attributes/source.html)
- [theverge](../vendor/mozilla/test/test-pages/theverge/source.html)
- [title-and-h1-discrepancy](../vendor/mozilla/test/test-pages/title-and-h1-discrepancy/source.html)
- [title-en-dash](../vendor/mozilla/test/test-pages/title-en-dash/source.html)
- [tmz-1](../vendor/mozilla/test/test-pages/tmz-1/source.html)
- [toc-missing](../vendor/mozilla/test/test-pages/toc-missing/source.html)
- [tumblr](../vendor/mozilla/test/test-pages/tumblr/source.html)
- [v8-blog](../vendor/mozilla/test/test-pages/v8-blog/source.html)
- [wapo-1](../vendor/mozilla/test/test-pages/wapo-1/source.html)
- [wapo-2](../vendor/mozilla/test/test-pages/wapo-2/source.html)
- [wikia](../vendor/mozilla/test/test-pages/wikia/source.html)
- [wikipedia](../vendor/mozilla/test/test-pages/wikipedia/source.html)
- [wikipedia-3](../vendor/mozilla/test/test-pages/wikipedia-3/source.html)
- [wikipedia-4](../vendor/mozilla/test/test-pages/wikipedia-4/source.html)
- [wordpress](../vendor/mozilla/test/test-pages/wordpress/source.html)
- [yahoo-1](../vendor/mozilla/test/test-pages/yahoo-1/source.html)
- [yahoo-2](../vendor/mozilla/test/test-pages/yahoo-2/source.html)
- [yahoo-3](../vendor/mozilla/test/test-pages/yahoo-3/source.html)
- [yahoo-4](../vendor/mozilla/test/test-pages/yahoo-4/source.html)
- [youth](../vendor/mozilla/test/test-pages/youth/source.html)

## Updating this report

After changing a pinned engine, DOM dependency, or fixture corpus, rerun the comparison and inspect the changed cases. Update this report from the new JSON rather than treating its current counts as a golden test. A difference needs a case-specific content review before it can be called an improvement or regression.

Upstream source identities and import boundaries are documented in [UPSTREAM.md](../UPSTREAM.md). Imported Chromium changes and standalone adaptations are described in [PATCHES.md](../PATCHES.md).
