# Migration guide

This guide covers three entry points: an application using Mozilla Readability, a tool copied from Chromium's extraction scripts, and a reader interface that needs article content.

For Node.js integration, first check that the runtime matches `^22.22.2 || ^24.15.0 || >=26.0.0`. The Node entry uses jsdom 30.1.3; its minimum runtime requirements can be newer than those of an existing direct Readability integration.

## From Mozilla Readability in Node.js

A typical direct integration creates a DOM and passes it to the constructor:

```js
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const dom = new JSDOM(html, { url });
const article = new Readability(dom.window.document).parse();
```

The corresponding readability-kit entry is:

```js
import { extractHTML } from '@soulteary/readability-kit/node';

const article = extractHTML(html, {
  url,
  engine: 'mozilla',
});
```

Use `engine: 'chromium'`, or omit `engine`, to adopt the pinned Chromium modifications. The package's Mozilla engine is the specific baseline listed in [UPSTREAM.md](../UPSTREAM.md), which may differ from the version currently installed in your application.

Both engine choices use the package's shared cleanup, sanitizer, and metadata normalization. If you require an unwrapped upstream comparison, run the vendored engine directly in a test; switching `engine` does not disable those shared stages.

### Options and results

Common Readability options such as `charThreshold`, `maxElemsToParse`, `keepClasses`, and `disableJSONLD` are top-level extraction options:

```js
const article = extractHTML(html, {
  url: 'https://example.com/posts/one',
  charThreshold: 200,
  maxElemsToParse: 100_000,
  disableJSONLD: false,
});
```

The supported options are listed in the [README](../README.md#extraction-options). The package validates its public inputs instead of forwarding arbitrary object properties into the engine.

The result retains familiar fields such as `title`, `content`, `textContent`, and `byline`, and adds `url` and `engine`. Optional metadata is represented by `null` when absent. Treat `null` as a normal no-article result, and handle thrown errors separately.

## From Mozilla Readability in a browser

Replace manual document cloning and the direct constructor call with:

```js
import { extractDocument } from '@soulteary/readability-kit';

const article = extractDocument(document, {
  engine: 'mozilla',
});
```

The package clones the input and, by default, includes open shadow roots and slot content in that clone. To use ordinary cloning without flattening, set `flattenShadowRoots: false`.

If your application uses the quick readerability estimate, use the package's `isProbablyReaderable()` function with the same engine choice. Keep an explicit extraction action available for users: a negative estimate does not prove that extraction will fail.

For documents parsed separately from the current page, provide their actual source URL:

```js
const article = extractDocument(parsedDocument, {
  url: 'https://example.com/posts/one',
});
```

## From Chromium's extraction scripts

Use the public API instead of reproducing Chromium's resource build and JavaScript injection steps.

| Chromium integration detail | Standalone replacement |
| --- | --- |
| grit `<include>` directives and script placeholders | Package imports and typed options |
| `window.Readability` installation | Module-local engine selection |
| The current page's `document` and global constructors | Explicit document argument and its own DOM realm |
| `cloneFlattenedTree()` in the injected script | Shared cloning adapter, enabled by default |
| Debug runner's placeholder URL | Required real source URL for HTML-string extraction |
| Console-only error reporting | Exceptions for errors and `null` for no article |
| Chrome's downstream layout cleanup | Portable semantic cleanup; presentation remains in your reader |

Chrome's complete Reading Mode can select other extraction paths and uses browser services for accessibility-tree synchronization, selection, speech, and presentation. Adopting the DOM extraction path does not reproduce all those browser integrations.

## Rendering extracted articles

HTML sanitization is enabled by default. Review any application code that previously assumed Readability itself sanitized the result: extraction and sanitization are distinct operations.

An explicit opt-out is available when a separate trusted boundary handles output:

```js
const article = extractHTML(html, {
  url,
  sanitize: false,
});
```

Do not insert that unsanitized result into a document without applying your application's sanitizer. Even sanitized article HTML may retain media URLs, so the reader controls whether it permits media loading and link navigation.

Typography, themes, list styling, table scrolling, image sizing, and text-to-speech are reader features that can consume the returned article. Keep those decisions independent of extraction so an API consumer does not need a browser UI.

## Files, stdin, and services

The CLI accepts HTML from a file or standard input. Its `--url` is the article's origin context, not a request to download the page.

For a network service, fetch or render the page in a separate layer and pass its HTML or resulting document to the extractor. That layer owns redirects, access rules, timeouts, and any JavaScript execution needed to obtain the page. The extraction package operates on the input it is given.

## Before changing engines

Use representative saved inputs from your application. Compare the title, retained paragraphs, images, links, and metadata with the old implementation. A visual HTML diff alone can hide missing text or exaggerate harmless wrapper changes.

Record any intentional output differences and add regression cases for pages that matter to the application. This is especially useful for lead images, JSON-LD titles, web components, short articles, and pages containing substantial navigation or shopping content.
