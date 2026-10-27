# Upstream sources

This project pins both extraction engines to concrete revisions. A package release identifies those revisions separately from the package's own version.

## Pinned revisions

| Source | Revision | Local boundary |
| --- | --- | --- |
| Mozilla Readability | [`d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435`](https://github.com/mozilla/readability/tree/d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435) | `vendor/mozilla/` |
| Chromium | [`c63132a1048f364f67732370c6019ce92e8deb89`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/) | Selected files in `vendor/chromium/` |

Chromium's [Readability metadata at the pinned revision](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/third_party/readability/README.chromium) identifies the same Mozilla revision and version `0.6.0` as its baseline. Keeping this baseline makes comparisons meaningful: differences between the two engines start with Chromium's recorded modifications, rather than unrelated Mozilla version changes.

## Source ownership and history

Mozilla's repository is imported with its original commit graph connected to this repository. The pinned baseline and its ancestry contain **534 upstream commits**. Their original commit IDs, authors, dates, and messages remain available in Git history, while the source and regression fixtures are retained under `vendor/mozilla/`.

The import uses a native Git merge with the upstream baseline as its second parent and places the upstream tree under the vendor prefix. The reproducible procedure is in [tools/import-mozilla-history.sh](tools/import-mozilla-history.sh); it does not require a locally installed `git subtree` command.

For example, the baseline file can be inspected by its original object ID:

```bash
git show d7949dc47dd9ed9ee1d3b34ffdcf3bce28cde435:Readability.js
```

Chromium is imported as selected-file snapshots anchored to the pinned commit and original repository paths. Its per-file commit history is not replayed into this repository. [upstream.json](upstream.json) records the source revisions, original paths, and file hashes; the package's own adaptation commits describe changes made for standalone use.

Vendored code and standalone adapters have different maintenance roles. Keep an upstream snapshot recognizable and put integration changes in the package implementation. If an engine file must be modified locally, record that patch explicitly in [PATCHES.md](PATCHES.md), including the behavior it changes and a regression case.

## Chromium source map

All paths below refer to the pinned Chromium revision.

| Source path | Role in this project |
| --- | --- |
| [`third_party/readability/modded_src/Readability.js`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/third_party/readability/modded_src/Readability.js) | Chromium extraction engine |
| [`third_party/readability/modded_src/Readability-readerable.js`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/third_party/readability/modded_src/Readability-readerable.js) | Chromium's quick readerability heuristic |
| [`third_party/readability/README.chromium`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/third_party/readability/README.chromium) | Mozilla baseline, licensing metadata, and recorded Chromium modifications |
| [`components/dom_distiller/core/javascript/readability_distiller.js`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/components/dom_distiller/core/javascript/readability_distiller.js) | Reference for cloning the flattened tree, open shadow roots, and slots |
| [`chrome/browser/resources/side_panel/read_anything/content/readability_content_processing.ts`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/chrome/browser/resources/side_panel/read_anything/content/readability_content_processing.ts) | Reference for semantic cleanup and preserving inline whitespace |
| [`components/dom_distiller/core/javascript/content_processing.js`](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/components/dom_distiller/core/javascript/content_processing.js) | Reference for the distinction between content cleanup and viewer-specific presentation |

Some entries are adaptation references rather than runtime modules. The package does not require Chromium's resource compiler, Mojo interfaces, or browser process to execute these algorithms.

### Local Chromium layout

| Local path | Contents |
| --- | --- |
| `vendor/chromium/Readability.js` | Unmodified Chromium engine snapshot |
| `vendor/chromium/Readability-readerable.js` | Unmodified Chromium readerability snapshot |
| `vendor/chromium/README.chromium` | Chromium's dependency and modification metadata |
| `vendor/chromium/UPSTREAM-README.md` | Original `modded_src/README.md`, retained separately from project documentation |
| `vendor/chromium/LICENSE` | Original Readability attribution from Chromium |
| `vendor/chromium/package.json` | Local module boundary for the imported JavaScript |
| `vendor/chromium/reference/readability_distiller.js` | Original injected wrapper and flattened-tree clone |
| `vendor/chromium/reference/readability_triggering.js` | Original readerability-triggering wrapper |
| `vendor/chromium/reference/content_processing.js` | Original general content-processing reference |
| `vendor/chromium/reference/readability_content_processing.ts` | Original Reading Mode semantic-cleanup reference |

Chromium's image classifiers and other browser-only presentation sources are available through the upstream repository; they are not imported into this source snapshot.

## Boundaries

The imported algorithm and portable adapters implement HTML extraction. Chrome's complete Reading Mode additionally contains presentation state, accessibility-tree synchronization, browser UI, selection synchronization, speech features, and alternate extraction paths.

The Screen2x/Screen AI implementation and model binaries are outside this package. Chromium's [Screen AI documentation](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/services/screen_ai/README.md) identifies an internal source repository and separately downloaded components. The public Chromium wrapper's license does not establish a license for redistributing those complete binaries or models.

## Updating an upstream

1. Choose an exact upstream revision. Record its full commit ID and review the upstream metadata and license notices.
2. Compare the current and proposed engine snapshots. Keep shared heuristics in `Readability.js` and `Readability-readerable.js` aligned when applying Chromium updates.
3. Run the upstream regression corpus and the package's own extraction, environment, and output-handling tests.
4. Compare extracted text, metadata, and retained article structure. Record intentional differences; do not update expected results simply to make a test pass.
5. Add a fixed regression case for any local behavior change, then update this file and [PATCHES.md](PATCHES.md).
6. Build and inspect the package contents so the engines, required notices, and supported entries are included in the artifact.

Fixture data should keep its upstream provenance and associated notices. Avoid replacing fixed fixtures with live network requests, which makes results depend on site changes, consent pages, and regional responses.

## Licenses

Mozilla Readability and Chromium's modified Readability engine carry Apache-2.0 attribution. Mozilla's [LICENSE.md](vendor/mozilla/LICENSE.md) is preserved. The pinned Mozilla revision does not contain a `NOTICE` file; the project's [root NOTICE](NOTICE) consolidates the applicable attributions.

Chromium-authored integration code uses Chromium's BSD-style, three-clause license, preserved in [LICENSES/BSD-3-Clause-Chromium.txt](LICENSES/BSD-3-Clause-Chromium.txt). A complete Apache-2.0 text is also included at [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt). The repository's own [LICENSE](LICENSE) does not remove the notice requirements attached to imported files or dependencies.
