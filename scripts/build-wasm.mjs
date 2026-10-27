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
execFileSync('cargo', ['build', '-p', 'readability-wasm', '--target', 'wasm32-unknown-unknown', '--profile', 'wasm-release', '--locked'], {stdio: 'inherit'});
await rm('wasm/pkg', {recursive: true, force: true});
await mkdir('wasm/pkg', {recursive: true});
execFileSync(cli, ['target/wasm32-unknown-unknown/wasm-release/readability_wasm.wasm', '--target', 'web', '--out-dir', 'wasm/pkg', '--out-name', 'readability_wasm'], {stdio: 'inherit'});
const glue = await readFile('wasm/pkg/readability_wasm.js', 'utf8');
const compat = await readFile('wasm/compat.js', 'utf8');
await writeFile('wasm/pkg/readability_wasm.js', (await transform(glue + '\n' + compat, {minify: true, format: 'esm', target: 'es2022'})).code);
await writeFile('wasm/pkg/readability_wasm.d.ts', await readFile('wasm/pkg/readability_wasm.d.ts', 'utf8') + '\nexport function request_json(input: string): string;\n');
await build({entryPoints: ['wasm/index.ts'], outfile: 'wasm/pkg/index.js', bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', plugins: [{name: 'binding-path', setup(build) { build.onResolve({filter: /^\.\/pkg\/readability_wasm\.js$/}, () => ({path: './readability_wasm.js', external: true})); }}]});
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--strict', '--skipLibCheck', '--declaration', '--emitDeclarationOnly', '--outDir', 'wasm/pkg/types', 'wasm/index.ts'], {stdio: 'inherit'});
// Flatten the declaration entry and retain only the shared public types.
const declaration = await readFile('wasm/pkg/types/wasm/index.d.ts', 'utf8');
await writeFile('wasm/pkg/index.d.ts', declaration.replaceAll('../src/types.js', './types.js'));
await copyFile('wasm/pkg/types/src/types.d.ts', 'wasm/pkg/types.d.ts');
await rm('wasm/pkg/types', {recursive: true, force: true});
await writeFile('wasm/pkg/worker.js', (await transform(await readFile('wasm/worker.js', 'utf8'), {minify: true, format: 'esm', target: 'es2022'})).code);

for (const path of ['wasm/licenses', 'wasm/dependency-licenses', 'wasm/source', 'wasm/LICENSES']) await rm(path, {recursive: true, force: true});
execFileSync(process.env.PYTHON ?? 'python3', ['scripts/package-wasm.py'], {stdio: 'inherit'});
