# Reader example

A small browser playground for comparing Chromium's Readability enhancements with the Mozilla baseline. It accepts pasted HTML and a source URL, then displays the extracted article, HTML, JSON, and metadata.

## Run

From the repository root:

```sh
bun install --frozen-lockfile
bun run build
bun run demo
```

Open [http://127.0.0.1:4173/examples/reader/](http://127.0.0.1:4173/examples/reader/), load the built-in sample, and choose **Extract article**. The sample is fictional text written for this project.

To choose another port:

```sh
bun run demo --port 4174
```

The server binds to `127.0.0.1` and serves only `examples/reader/` and `dist/`. It rejects private dotfiles and paths outside those directories, including symlink targets. Stop it with Ctrl+C.

## What the example does

The source URL supplies the base for relative links; the example does not fetch that address. `DOMParser` parses the supplied HTML without executing page scripts, and `extractDocument(document, { url, engine })` performs extraction with its default sanitization.

The reading preview uses a sandboxed iframe with a restrictive content policy. Remote media and navigation are disabled in the preview. The **HTML** and **JSON** views show the extracted result, including its resolved links. The example uses local assets and system fonts, with no analytics or external dependencies beyond the built package.

Pasted HTML cannot recreate a live page's script-generated content or runtime-created shadow roots. To extract those, call `extractDocument()` with the actual live document from an appropriately authorized browser integration.

## Files

- `index.html`: input form, accessible result tabs, and preview container.
- `app.js`: synthetic sample, extraction calls, and result display.
- `styles.css`: responsive layout and typography.
- `../../scripts/serve-example.mjs`: the development server.
