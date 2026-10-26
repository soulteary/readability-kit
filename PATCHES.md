# Imported changes and standalone adaptations

This document distinguishes changes already present in Chromium from the package's integration work. Exact revisions are listed in [UPSTREAM.md](UPSTREAM.md).

## Changes already present in the Chromium engine

The following summary follows Chromium's [pinned modification record](https://chromium.googlesource.com/chromium/src/+/c63132a1048f364f67732370c6019ce92e8deb89/third_party/readability/README.chromium). These improvements are upstream Chromium work; they are not new algorithms authored by this project.

| Imported behavior | Practical effect |
| --- | --- |
| Preserve images inside figures | Avoid losing article images during content cleanup |
| Recover a lead image and its caption before the main article candidate | Retain the opening illustration while removing the original container to prevent duplication |
| Improve JSON-LD `name` / `headline` selection | Resolve competing title fields using their relationship to the document title |
| Remove labels whose referenced inputs were discarded | Avoid leaving isolated form labels in article content |
| Recognize recipe content and refine single-child promotion | Retain substantial content that could otherwise be discarded |
| Extend unwanted-container keywords for shopping content | Reduce interactive shopping carousels in extracted articles |
| Accept `cite` as a caption or credit signal | Preserve more lead-image captions and credits |
| Anchor the `ad-break` keyword to a token boundary | Avoid removing article paragraphs whose class is `continue-read-break` |

The full source snapshots remain the authoritative implementation. A short feature table cannot enumerate every consequence of a heuristic change.

## Standalone integration

### Engine selection

The package exposes Chromium's modified engine by default and the matching Mozilla engine through `engine: 'mozilla'`. Both run behind the same preparation, cleanup, sanitization, and result-normalization layers. Direct calls to a vendored engine are useful for raw upstream comparisons; the public API provides the package's complete behavior.

### Document cloning and open Shadow DOM

The adapter follows Chromium's flattened-tree cloning approach:

- Use native deep cloning when there are no open shadow roots to flatten.
- For an open shadow host, clone the shadow tree and project assigned slot content instead of duplicating its light-DOM children.
- Preserve HTML template contents through the DOM's import/clone behavior.
- Leave the caller's source document unchanged.

The standalone implementation handles the document's own realm instead of assuming all DOM constructors belong to the current global object. Closed roots and content that has not yet been rendered into the supplied document remain outside extraction.

### Explicit source URLs under CSP

Documents created by `DOMParser` can inherit an application's `base-uri` Content Security Policy. An inserted `<base>` may therefore be ignored. For an explicit `url`, the adapter computes the source page's HTTP(S) base and sets extraction-only `baseURI`, `documentURI`, and `URL` properties on the inert clone. It leaves browser policy, navigation, DOM prototypes, and the caller's document unchanged.

Existing image `src` attributes are made absolute before Chromium's early lead-image selection. The upstream implementation still resolves anchors, lazy images, `srcset`, and other media. Node and real-browser regressions cover source bases, fragments, lazy images, and strict `base-uri 'none'`.

### Semantic cleanup

The adapter takes the portable parts of Chromium's Reading Mode cleanup and makes the boundary explicit:

- Remove small active accessibility announcements and exact short advertising labels; retain `aria-live="off"` content.
- Preserve meaningful inline whitespace so adjacent words do not become joined.
- Preserve containers holding media or mathematical content.
- Apply deterministic DOM rules without relying on a rendered element's bounding rectangle.

Exact label matching is a local adaptation: substantive prose that mentions sponsorship should not be discarded merely because it contains one of the keywords. The package does not claim to reproduce Chromium's layout-dependent cleanup decisions.

### HTML sanitization

DOMPurify is applied by default to the engine's extracted HTML before semantic cleanup. Cleanup then removes nodes or replaces whitespace separators, and the final text and length are derived from that output. `sanitize: false` is an explicit opt-out for applications that provide their own output-handling boundary. This is separate from the upstream extraction heuristic.

### Node.js adapter and CLI

The Node entry uses a DOM implementation with page-script execution and remote resource loading disabled. It requires the real source URL instead of the placeholder base URL used by Chromium's debugging script. The CLI builds on that API, supports file or standard input, and distinguishes no-content results from errors with separate exit statuses.

### Result normalization

The public result adds the selected engine and source URL, exposes standard article metadata, and returns `null` for a normal no-article result. `length` represents text length rather than a language-dependent word-count estimate.

## Adding a patch

For each future local change, record:

- The upstream file or behavior it derives from, with an immutable commit link.
- The user-visible problem and the smallest behavior change that fixes it.
- A fixed regression input and the expected content or metadata change.
- Whether the change affects both engines or only one engine.
- Any change to a supported option, output field, or license notice.

Prefer contributing general extraction improvements upstream. Keep integration-specific behavior in the standalone adapters so engine updates remain reviewable.
