# Architecture

readability-kit turns supplied HTML or a DOM document into a normalized article result. Its runtime is organized around an extraction engine and a small set of environment adapters.

## Workspace and release boundaries

The root is a private orchestration workspace. `packages/javascript/` and
`packages/wasm/` are separate npm release units, each owning its manifest,
source and build output. `packages/shared/src/` contains private types and option
validation; build tools bundle that code and flatten public declarations so
published artifacts have no imports into the repository or private workspace.

`go/` remains an independent Go module. `crates/` remains the Rust workspace:
`readability-core` implements native extraction, `readability-cli` supplies native
commands, and `readability-wasm` binds the core for `packages/wasm/`. The original
`vendor/` layout and hash-verified upstream corpus are unchanged.

Package-specific JavaScript tests live in `packages/javascript/test/`. Shared
contract fixtures and real-browser integration live in `tests/`. `tools/compatibility.mjs`
captures the JavaScript oracle and compares Go, Rust and WASM implementations;
its contract is independent of the candidate language. Each package is tested
from a packed artifact installed outside the workspace.

See [WORKSPACE.md](docs/WORKSPACE.md) for build and packaging commands. Python is
not part of this migration.

## Public entries

| Entry | Environment | Responsibilities |
| --- | --- | --- |
| `@soulteary/readability-kit` | Browser DOM; compatible supplied DOM implementations | Document extraction, readerability estimate, engine selection, output handling |
| `@soulteary/readability-kit/node` | Node.js `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | HTML parsing with an explicit source URL, then the shared extraction pipeline |
| `readability-kit` | Command line | Input/output, argument validation, format selection, exit status |
| Browser example | Browser | A small consumer of the API for manual inspection |

Both ES modules and CommonJS are supported. The browser entry is separated from the Node adapter so applications can use a native DOM without importing Node-only HTML parsing dependencies.

## Processing stages

### 1. Establish the document and source URL

The browser entry receives an existing document. The Node entry builds a document from a supplied HTML string and the required absolute HTTP(S) source URL. Relative article links and images are interpreted in that source context.

An explicit `url` supplies URL metadata on the cloned extraction document. This avoids relying on an inserted `<base>` that an application's CSP can block. A valid HTTP(S) source `<base href>` is resolved against that URL; the original document and browser policy remain unchanged.

The Node adapter uses jsdom 30.1.3 without enabling script execution or remote resources. It processes the supplied markup; it does not wait for an application to hydrate or navigate a browser to a URL. Its supported Node.js versions are reflected in the package's engine range above.

### 2. Clone the extraction input

Readability mutates its input. The package prepares a separate document so a browser application can continue using the original page.

When enabled, open Shadow DOM is flattened into that clone. Assigned nodes replace slots, and a shadow host's light children are included through slot projection rather than copied twice. DOM realm checks account for documents created in a different window or DOM implementation.

The fast path uses a normal deep clone when flattening is unnecessary. A closed shadow root cannot be inspected through the ordinary DOM API. Parsing an HTML string also does not reconstruct shadow trees created by scripts that have not run.

### 3. Run the selected heuristic

`chromium` runs the modified source pinned in `vendor/chromium/`. `mozilla` runs its matching baseline in `vendor/mozilla/`.

The selected engine identifies article content and metadata. An ordinary failure to identify an article returns `null`. A malformed option or execution failure is an error rather than a successful article containing an empty string.

`isProbablyReaderable()` is a separate inexpensive estimate. Its result is advisory; extraction is available without requiring the estimate to succeed.

### 4. Sanitize extracted HTML

DOMPurify 3.4.17 sanitizes the engine's article HTML by default. The package removes page styling and interactive form controls as part of its output policy. Applications that disable sanitization own the rendering policy for that output.

An application may also choose a stricter policy for media requests, link navigation, or embedded content.

### 5. Apply portable semantic cleanup and normalize

Cleanup handles short UI labels and accessibility announcements while retaining meaningful whitespace and containers carrying article media or mathematics. It uses DOM semantics instead of browser layout geometry, so this stage can run in both environments.

Visual layout decisions belong to a reader application. Examples include image sizing, horizontal scrolling around tables, typography, line focus, and video containers.

Output fields are normalized into the shared `Article` type, including the source URL and selected engine. `textContent` and `length` are derived from the final content after sanitization and cleanup. Text length uses UTF-16 code units and must not be interpreted as a word count or reading-time estimate.

## Source boundaries

| Area | Ownership |
| --- | --- |
| `vendor/mozilla/` | Mozilla baseline, original source history, and regression corpus |
| `vendor/chromium/` | Pinned extraction engines, source metadata, license, and package boundary |
| `vendor/chromium/reference/` | Original wrapper and content-processing snapshots used to derive adapters |
| `upstream.json` | Machine-readable source revisions, original paths, and file hashes |
| Package implementation | Runtime adaptation, validation, normalization, and output policy |
| CLI and example | Consumers of the public API |
| Project tests | Standalone behavior and regression checks |

Chromium's browser services are useful design references but introduce dependencies on its accessibility tree, IPC, process lifecycle, and internal UI resources. This package's runtime boundary is the DOM extraction path. Screen AI libraries and model binaries are not part of the runtime.

## Validation strategy

The engine baseline and the standalone wrapper answer different questions:

- Run upstream fixtures against the relevant raw engine to detect changes in its extraction heuristic.
- Test the public API for cloning, base URL handling, engine selection, normalized metadata, and no-content behavior.
- Exercise real browser DOM behavior for shadow roots, slot projection, and source-document preservation.
- Check output sanitization and CLI errors through their public boundaries.
- Inspect the built package entries and included notices before distribution.

Comparisons should examine retained text, article structure, and metadata. Wrapper output is intentionally not a byte-for-byte promise of either raw upstream engine or Chrome's complete Reading Mode UI.

## Python bindings

`crates/readability-python` binds the native Rust core with PyO3.
`python/src/readability_kit` owns the typed snake_case API, immutable Article,
strict Python argument validation and offline CLI. Native extraction retains
immutable Python-backed HTML while releasing the GIL; the owner is dropped after
reattachment. Options and result fields cross directly without a JSON round trip.
The private compatibility adapter preserves the existing raw/JS
boundary while success cases exercise the Python facade. Packaging uses maturin
and includes local Rust dependencies plus dependency notices and MPL sources.
The Cargo version is authoritative. Portable sdists bundle the all-target
dependency closure; extension builds reject stale lock snapshots or mismatched
target-specific notices. See [Python package](python/README.md) for build and acceptance commands.
