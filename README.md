# readability-kit

Extract readable article content from HTML or a browser document, using Chromium's modified Readability engine or the matching Mozilla baseline.

The package provides a browser API, a Node.js API, and a command-line interface. It keeps the extraction engines traceable to their upstream revisions and adds a shared wrapper for document cloning, open Shadow DOM, semantic cleanup, and HTML sanitization.

## Build from source

Supported Node.js versions are **22.22.2 or later in the 22.x series**, **24.15.0 or later in the 24.x series**, or **26.0.0 and later**. The package's engine range is `^22.22.2 || ^24.15.0 || >=26.0.0`, matching the requirements of its Node DOM adapter, jsdom 30.1.3.

```bash
git clone https://github.com/soulteary/readability-kit.git
cd readability-kit
npm ci
npm run build
npm test
```

The package name is `@soulteary/readability-kit`. To create a local installable package, run `npm pack` and install the generated tarball in your application. These instructions work directly from the repository and do not depend on a registry release.

## Node.js

Pass the HTML and its original URL. The URL supplies the base for relative image and link addresses.

```js
import { readFile } from 'node:fs/promises';
import { extractHTML } from '@soulteary/readability-kit/node';

const html = await readFile('article.html', 'utf8');
const article = extractHTML(html, {
  url: 'https://example.com/articles/hello',
});

if (article) {
  console.log(article.title);
  console.log(article.textContent);
  console.log(article.content); // Sanitized article HTML.
}
```

CommonJS is also supported:

```js
const { extractHTML } = require('@soulteary/readability-kit/node');
```

`extractHTML()` parses the supplied HTML without enabling page scripts or remote resource loading. Fetching a URL and rendering a dynamic application are separate responsibilities.

## Browser

Use the package's default entry in your browser build:

```js
import { extractDocument } from '@soulteary/readability-kit';

const article = extractDocument(document, {
  engine: 'chromium',
});

if (article) {
  console.log(article.title, article.content);
}
```

The source document is cloned before extraction. Open shadow roots and assigned slot content are flattened into the clone by default, so article text inside web components can be considered. Closed shadow roots remain inaccessible to ordinary page JavaScript.

For a detached document, provide an absolute HTTP(S) `url` when its document URL is not the article's original address.

## API

| Entry | Function | Result |
| --- | --- | --- |
| `@soulteary/readability-kit` | `extractDocument(document, options?)` | `Article` or `null` |
| `@soulteary/readability-kit` | `isProbablyReaderable(document, options?)` | Boolean heuristic |
| `@soulteary/readability-kit/node` | `extractHTML(html, options)` | `Article` or `null` |

The `Article` result contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `title` | `string` | Extracted article title |
| `content` | `string` | Processed article HTML; sanitized by default |
| `textContent` | `string` | Article text |
| `length` | `number` | Length of the final `textContent` in UTF-16 code units, not a word count |
| `url` | `string` | Source URL used for extraction |
| `engine` | `'chromium' \| 'mozilla'` | Extraction heuristic used |
| `byline`, `dir`, `lang`, `excerpt`, `siteName`, `publishedTime` | `string \| null` | Optional metadata reported by the extractor |

### Extraction options

Options are top-level properties. `extractHTML()` requires `url`.

| Option | Default | Purpose |
| --- | --- | --- |
| `engine` | `'chromium'` | Select the Chromium-modified engine or the pinned Mozilla baseline |
| `url` | Document URL in the browser | Explicit overrides must be absolute HTTP(S) addresses; required for HTML strings |
| `flattenShadowRoots` | `true` | Include accessible open shadow roots and assigned slot content in the clone |
| `sanitize` | `true` | Sanitize output HTML with DOMPurify |
| `charThreshold` | Upstream default | Minimum article length considered by Readability |
| `maxElemsToParse` | Upstream default | Limit DOM elements considered; `0` means no explicit element cap |
| `nbTopCandidates` | Upstream default | Number of top content candidates considered |
| `keepClasses`, `classesToPreserve` | Upstream defaults | Control source CSS class retention during extraction |
| `disableJSONLD` | Upstream default | Disable JSON-LD metadata extraction |
| `linkDensityModifier` | Upstream default | Adjust the link-density heuristic |

Both engines use the same document preparation, semantic cleanup, sanitizer, and result normalization. `engine: 'mozilla'` selects Mozilla's extraction heuristic; it does not bypass the package wrapper.

`isProbablyReaderable()` accepts `engine`, `minContentLength`, `minScore`, and `flattenShadowRoots`. It is a fast estimate that can produce false positives and false negatives. Applications can offer extraction even when this estimate is false.

TypeScript types include `Article`, `Engine`, `ExtractOptions`, and `ReaderableOptions`. The Node entry also exports `HTMLExtractOptions`.

### Output handling

The default output is sanitized. Set `sanitize: false` only when your application intentionally handles unsanitized extraction output and applies its own rendering policy. Readability's heuristics alone are not an HTML sanitizer.

Rendering retained images or following links can make network requests according to your application's policy. Extracting metadata does not establish the accuracy of an author name or publication date.

## Command line

After installing the built package, the executable is `readability-kit`:

```bash
readability-kit article.html \
  --url https://example.com/articles/hello \
  --format json

readability-kit article.html \
  --url https://example.com/articles/hello \
  --engine mozilla \
  --format text

cat article.html | readability-kit - \
  --url https://example.com/articles/hello \
  --format html

readability-kit article.html \
  --url https://example.com/articles/hello \
  --output article.json
```

Formats are `json` (the default), `html`, and `text`; the default engine is `chromium`. The CLI reads a local file or standard input, and `--url` supplies article context. Output goes to stdout unless `--output` is provided. An output file is replaced only after extraction succeeds. Exit status is `0` for an extracted article or help/version output, `2` when no article is found, and `1` for an error.

## Browser example

```bash
npm run build
npm run demo
```

Open [the local reader example](http://127.0.0.1:4173/examples/reader/). It accepts pasted HTML and a source URL, offers both engines, and displays the article, HTML, JSON, and metadata. The reading preview disables remote media and navigation. See the [example guide](examples/reader/README.md) for its input and rendering boundaries.

## Upstream and maintenance

### Experimental Rust implementation

A native Rust library and CLI are available for compatibility evaluation:

```bash
cargo build --release --workspace --locked
./target/release/readability-kit article.html --url https://example.com/story
```

The native engine modes are not yet equivalent to the pinned JavaScript
engines. The npm package continues to use the JavaScript implementation.
See the [migration status](docs/RUST_MIGRATION.md) and
[compatibility contract](docs/RUST_COMPATIBILITY.md) for measured differences,
verification commands, and adoption gates.

The Chromium snapshot contains improvements for lead images and captions, JSON-LD title selection, recipe content, form-label cleanup, and unwanted shopping containers. The matching Mozilla engine is retained to make changes easier to compare.

### Validation

```bash
# Build, verify pinned sources/history, and run the package's integration tests.
npm test

# Run Mozilla's original regression suite without changing its source.
npm run test:upstream

# Exercise every original article fixture with both raw extraction engines.
npm run compare -- --check --output upstream-comparison.json

# Install the packed artifact in an isolated consumer and check exports/types.
npm run test:package

# Run the actual Chromium browser demo and live-document tests.
npx playwright install chromium
npm run test:browser
```

`npm run check` combines the source, integration, upstream, comparison, and package checks. CI also runs the browser tests. The [upstream comparison report](docs/UPSTREAM_COMPARISON.md) records the initial corpus results and explains how to interpret differences.

- [UPSTREAM.md](UPSTREAM.md): exact revisions, source boundaries, and update procedure.
- [PATCHES.md](PATCHES.md): imported improvements and standalone adaptations.
- [ARCHITECTURE.md](ARCHITECTURE.md): runtime boundaries and processing stages.
- [Migration guide](docs/MIGRATION.md): adopting the package from Mozilla or Chromium code.

The project uses the Apache License 2.0 in [LICENSE](LICENSE). Mozilla's original [LICENSE.md](vendor/mozilla/LICENSE.md) is preserved. Chromium-derived code retains the notices covered by [BSD-3-Clause-Chromium.txt](LICENSES/BSD-3-Clause-Chromium.txt); the [root NOTICE](NOTICE) consolidates project attributions. Consult those notices and the notices shipped with dependencies when redistributing the package. This is an independent project and is not an official Chrome, Chromium, or Mozilla release.
