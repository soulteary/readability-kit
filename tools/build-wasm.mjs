#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {execFileSync} from 'node:child_process';
import {mkdir, rm, copyFile, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build, transform} from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const cli = process.env.WASM_BINDGEN ?? 'wasm-bindgen';
const version = '0.2.117';
if (execFileSync(cli, ['--version'], {encoding: 'utf8'}).trim() !== `wasm-bindgen ${version}`) {
  throw new Error(`Install wasm-bindgen-cli ${version} to match Cargo.lock.`);
}
// Offline metadata resolves the whole workspace, including dev and non-WASM
// manifests. A single-crate/target build does not populate that complete cache.
execFileSync('cargo', ['fetch', '--locked'], {stdio: 'inherit'});
execFileSync('cargo', ['build', '-p', 'readability-wasm', '--target', 'wasm32-unknown-unknown', '--profile', 'wasm-release', '--locked'], {stdio: 'inherit'});
await rm('packages/wasm/pkg', {recursive: true, force: true});
await mkdir('packages/wasm/pkg', {recursive: true});
execFileSync(cli, ['target/wasm32-unknown-unknown/wasm-release/readability_wasm.wasm', '--target', 'web', '--out-dir', 'packages/wasm/pkg', '--out-name', 'readability_wasm'], {stdio: 'inherit'});
const glue = await readFile('packages/wasm/pkg/readability_wasm.js', 'utf8');
const compat = await readFile('packages/wasm/src/compat.js', 'utf8');
await writeFile('packages/wasm/pkg/readability_wasm.js', (await transform(glue + '\n' + compat, {minify: true, format: 'esm', target: 'es2022'})).code);
await writeFile('packages/wasm/pkg/readability_wasm.d.ts', await readFile('packages/wasm/pkg/readability_wasm.d.ts', 'utf8') + '\nexport function request_json(input: string): string;\n');
await build({absWorkingDir: root, entryPoints: ['packages/wasm/src/index.ts'], outfile: 'packages/wasm/pkg/index.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', plugins: [{name: 'binding-path', setup(build) { build.onResolve({filter: /^\.\.\/pkg\/readability_wasm\.js$/}, () => ({path: './readability_wasm.js', external: true})); }}]});
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--strict', '--skipLibCheck', '--declaration', '--emitDeclarationOnly', '--rootDir', 'packages', '--outDir', 'packages/wasm/pkg/types', 'packages/wasm/src/index.ts'], {stdio: 'inherit'});
// Flatten the declaration entry and retain only the shared public types.
const declaration = await readFile('packages/wasm/pkg/types/wasm/src/index.d.ts', 'utf8');
await writeFile('packages/wasm/pkg/index.d.ts', declaration.replaceAll('../../shared/src/types.js', './types.js'));
await copyFile('packages/wasm/pkg/types/shared/src/types.d.ts', 'packages/wasm/pkg/types.d.ts');
await rm('packages/wasm/pkg/types', {recursive: true, force: true});
await writeFile('packages/wasm/pkg/worker.js', (await transform(await readFile('packages/wasm/src/worker.js', 'utf8'), {minify: true, format: 'esm', target: 'es2022'})).code);

for (const path of ['packages/wasm/licenses', 'packages/wasm/dependency-licenses', 'packages/wasm/source', 'packages/wasm/LICENSES']) await rm(path, {recursive: true, force: true});
execFileSync(process.env.PYTHON ?? 'python3', ['tools/package-wasm.py'], {stdio: 'inherit'});
