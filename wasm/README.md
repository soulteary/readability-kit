# readability-kit WASM

Rust article extraction for browsers and module Web Workers. This is a separate,
ESM-only npm package, `@soulteary/readability-kit-wasm`; it does not replace the
existing JavaScript package. The package has no npm runtime dependencies.

## Build

From the repository root (Node, npm, Python 3 and the existing JS dependencies are required):

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.117 --locked
bun run build:wasm
cd wasm
npm pack
```

`WASM_BINDGEN` selects an alternate CLI executable; `PYTHON` selects Python.
The build enforces the CLI version and Cargo.lock, generates JS and TypeScript
bindings, and collects dependency notices and matching MPL source. Generated
files are ignored by git. `npm pack` runs the build; use `--ignore-scripts` only
after a successful build. Building does not publish anything.

## Browser

```js
import {init, extractHTML, isProbablyReaderable} from '@soulteary/readability-kit-wasm';

await init();
const article = extractHTML(savedHTML, {
  url: 'https://example.com/articles/story',
  engine: 'chromium', // or 'mozilla'
});
const likelyArticle = isProbablyReaderable(savedHTML);
```

`init()` loads the colocated `readability_wasm_bg.wasm` once per JS realm.
Concurrent callers share the first initialization input; a failed load can be
retried. To control asset delivery, pass `init(wasmURL)`, a Response, bytes, or a
WebAssembly.Module. Calls before initialization throw. Serve `.wasm` with
`Content-Type: application/wasm` for streaming compilation. The host's CSP must
permit the module scripts, WASM compilation and (when used) module Workers.

The default `new URL(..., import.meta.url)` paths assume the generated files stay
together. For bundlers, configure copying of the generated `.wasm` and Worker
assets, and pass their emitted URLs explicitly when the bundler changes paths.
There is no bundler-specific auto-install or asset loader.

`extractHTML` is synchronous after initialization and follows the existing
HTML API's options, error validation, nullable metadata and `Article | null`
result. `isProbablyReaderable` accepts an HTML **string** instead of a Document,
so it also works without a DOM in Workers. Unknown option names are ignored by
the Rust boundary. Both Chromium and Mozilla behavior are available. The native
sanitizer and semantic cleanup run by default; `sanitize: false` retains semantic
cleanup but opts out of sanitization.

Parsing never executes the input's scripts or fetches its resources. The string
API cannot observe Shadow DOM: `flattenShadowRoots` is accepted for options
compatibility; flatten live open roots before serializing if needed. No
`extractDocument` API is provided by this package. JavaScript strings are encoded
as UTF-8 across the WASM boundary; isolated UTF-16 surrogates become replacement
characters. Extraction length remains measured in UTF-16 code units.

## Worker

```js
import {createWorkerReader} from '@soulteary/readability-kit-wasm';

const reader = await createWorkerReader();
try {
  const article = await reader.extractHTML(savedHTML, {
    url: 'https://example.com/articles/story',
    engine: 'mozilla',
  });
  const readable = await reader.isProbablyReaderable(savedHTML);
} finally {
  reader.terminate();
}
```

The factory starts one dedicated module Worker and initializes WASM there. It
does not initialize a main-thread instance. Requests are correlated by ID and
processed serially; input and output cross `postMessage` by structured clone.
`workerURL`, `wasmURL`, and `timeoutMs` are optional factory settings. Timeout
(default 30 seconds, including queue time), Worker load failure, and explicit
termination reject all pending calls and terminate the owned Worker. There is
no per-request cancellation or automatic restart; create a new reader to recover.

You can also create your own module Worker and call `await init()` and the same
synchronous APIs inside it. The `./worker` export identifies the provided RPC
worker entry; it is intended to be loaded as a Worker, not imported on the page.
The generated `request_json` shim is an internal compatibility transport; use
the validated public functions above in application code.

## Verification and measurements

```sh
bun run build
bun run build:wasm
bun run test:wasm
READABILITY_WASM=1 node scripts/check-rust-sanitizer.mjs
```

Install Playwright Chromium first (`bunx playwright install chromium`).
`READABILITY_TEST_CHROMIUM` can select another Chromium executable.
The test packs and unpacks the npm package, captures fresh JavaScript baselines,
compares full fields and errors in Chromium and Workers, tests JS boundary and
Worker lifecycle cases, and records compressed asset sizes, npm archive size,
fresh-realm initialization and warm extraction timings in `wasm-reports/`.
The full raw-engine corpus uses a test-only transport Worker; public extraction
and readerability cases use the shipped Worker client.

See [WASM implementation and measurements](https://github.com/soulteary/readability-kit/blob/main/docs/WASM.md) in the repository
for measured results and limits. Passing this locked corpus does not prove
compatibility for every HTML input or complete sanitizer correctness.

The optimized build passes HTML separately from JSON options and serializes the
Article directly. Browser facade and Worker signatures are unchanged. JS assets
are minified; the Rust build retains `opt-level=s`. Experimental Binaryen and
whole-program `opt-level=z` builds are not the default. See the repository's
[optimization comparison](https://github.com/soulteary/readability-kit/blob/main/docs/WASM_OPTIMIZATION.md)
for measured before/after results and reproduction.
