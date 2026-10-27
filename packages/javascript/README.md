# @soulteary/readability-kit

Portable article extraction using the pinned Chromium and Mozilla Readability engines.
The package provides browser DOM, Node.js HTML, and command-line entry points.

```sh
npm install @soulteary/readability-kit
```

```js
import {extractHTML} from '@soulteary/readability-kit/node';
const article = extractHTML('<article><p>Saved article HTML...</p></article>', {
  url: 'https://example.com/story',
});
```

Browser applications import `extractDocument` and `isProbablyReaderable` from
`@soulteary/readability-kit`. ESM and CommonJS exports and TypeScript declarations
are included. Output is sanitized by default; parsing never fetches the source URL.

See the [repository guide](https://github.com/soulteary/readability-kit#readme)
for options, CLI usage, examples, and compatibility scope.

## Building from the repository

Install workspace dependencies with `bun install --frozen-lockfile` at the repository
root. From this directory, `npm run build`, `npm test`, and `npm pack` build, test,
and package this release unit. Packaging requires the repository source checkout;
installing the generated tarball does not require the workspace or Rust toolchain.

The public package name, version and entry points are unchanged by the workspace migration.
See the included LICENSE, LICENSES, NOTICE, UPSTREAM.md and PATCHES.md for attribution.
