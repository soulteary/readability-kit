import {build} from 'esbuild';
import {chmod, copyFile, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
await rm('dist', {recursive: true, force: true});
await mkdir('dist', {recursive: true});
const common = {
  bundle: true,
  target: 'es2022',
  legalComments: 'external',
  logLevel: 'info',
  banner: {js: '/* readability-kit: see LICENSE, LICENSES/ and NOTICE for upstream licenses. */'},
};

await Promise.all([
  ...['esm', 'cjs'].map(format => build({
    ...common, entryPoints: ['src/index.ts'], platform: 'browser', format,
    outfile: `dist/index.${format === 'esm' ? 'js' : 'cjs'}`,
  })),
  ...['esm', 'cjs'].map(format => build({
    ...common, entryPoints: ['src/node.ts'], platform: 'node', format,
    external: ['jsdom', 'dompurify'],
    outfile: `dist/node.${format === 'esm' ? 'js' : 'cjs'}`,
  })),
  build({
    ...common, entryPoints: ['src/cli.ts'], platform: 'node', format: 'esm',
    external: ['jsdom', 'dompurify'], outfile: 'dist/cli.js',
  }),
]);

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], {stdio: 'inherit'});
// CJS consumers need declarations in a CJS module context, including imports.
for (const name of await readdir('dist')) {
  if (!name.endsWith('.d.ts')) continue;
  const text = await readFile(path.join('dist', name), 'utf8');
  await writeFile(path.join('dist', name.replace(/\.d\.ts$/, '.d.cts')),
    text.replace(/(['"]\.\/[^'"]+)\.js(['"])/g, '$1.cjs$2'));
}
await chmod('dist/cli.js', 0o755);
// DOMPurify is bundled into the browser entry point.
await copyFile('node_modules/dompurify/LICENSE', 'LICENSES/DOMPurify-LICENSE.txt');
