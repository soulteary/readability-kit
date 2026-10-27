# Workspace layout and package releases

The repository root is private. Public npm names, versions, entry points and
runtime behavior are unchanged; no Python package is introduced.

## Moved paths

- `src/` → `packages/javascript/src/`, except types and validation below.
- `src/types.ts`, `src/validation.ts` → `packages/shared/src/`.
- `wasm/` → `packages/wasm/`; authored JavaScript/TypeScript now lives in `src/`.
- `test/core.test.mjs`, `test/cli.test.mjs` → `packages/javascript/test/`.
- Remaining `test/` content → `tests/`.
- `scripts/` → `tools/`; `rust-compatibility.mjs` → `compatibility.mjs`.
- Root `tsconfig.json` → `packages/javascript/tsconfig.json`.

`go/`, `crates/` and `vendor/` keep their locations. Historical JSON, HTML and
archived benchmark evidence retain their recorded paths and hashes. Old commands
inside historical evidence describe the original checkout; use current tools
and commands for new measurements. Existing ignored report directories remain
in place to preserve command-line and report conventions.

## Dependencies and outputs

Run `bun install --frozen-lockfile` from the root. The root owns development tools;
the JavaScript package owns its `dompurify` and `jsdom` runtime dependencies.
The root references the JavaScript workspace for its oracle tooling and declares
the DOM dependencies that repository tools import directly. Both public packages
declare the private shared package as a build-only workspace dependency.

`packages/shared` is private source, not a separately published dependency.
Both public packages compile it into their JavaScript and copy its public type
declarations into their own output. Consumers only need the packed package and
its declared runtime dependencies.

JavaScript output is `packages/javascript/dist/`. WASM output is
`packages/wasm/pkg/`. Package builds copy root license and upstream attribution
into ignored package-local staging files. The JavaScript and WASM README files
are package-owned. Do not edit generated output or staged legal files.

## Validation

```bash
bun run check                 # Typecheck, JS/tool tests, upstream, package install
bun run test:browser          # Shared browser integration
bun run check:wasm            # JS oracle + WASM build, packed browser/Worker checks
bun run test:package:wasm     # Isolated npm install, exports, extraction and types
cargo test --workspace --locked
(cd go && go test ./...)
node tools/go-compatibility.mjs
```

The existing native and browser sanitizer gates retain their environment-variable
interfaces; invoke them under `tools/` rather than `scripts/`. All root commands
run from the repository root. Package build/prepack scripts locate the root
independently of the caller's working directory.

## Packing without publishing

```bash
bun run pack:javascript
bun run pack:wasm
```

These run prepack and create independent tarballs. They do not publish to npm.
Equivalent package-local commands are `npm run build` and `npm pack`.

Package checks execute the real prepack lifecycle before installing into temporary
consumers outside the monorepo, including ESM,
CommonJS where supported, TypeScript declarations, and runtime extraction. WASM
browser tests additionally exercise the packed Worker and browser assets.

## Migration regression checks

`tests/workspace.test.mjs` checks declared cross-package build dependencies,
first-party import paths, direct external dependency declarations, CI command
paths, and filtered workflow coverage. Rust browser CI includes the reader
example's files because those tests serve and exercise the example.

Benchmark and WASM provenance include the relocated package manifests and
TypeScript configuration. Historical report data and upstream-relative paths
remain unchanged.
