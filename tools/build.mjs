import {build} from 'esbuild';
import {chmod, copyFile, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
await rm('packages/javascript/dist', {recursive: true, force: true});
await mkdir('packages/javascript/dist', {recursive: true});
const common = {
  absWorkingDir: root,
  bundle: true,
  target: 'es2022',
  legalComments: 'external',
  logLevel: 'info',
  banner: {js: '/* readability-kit: see LICENSE, LICENSES/ and NOTICE for upstream licenses. */'},
};

await Promise.all([
  ...['esm', 'cjs'].map(format => build({
    ...common, entryPoints: ['packages/javascript/src/index.ts'], platform: 'browser', format,
    outfile: `packages/javascript/dist/index.${format === 'esm' ? 'js' : 'cjs'}`,
  })),
  ...['esm', 'cjs'].map(format => build({
    ...common, entryPoints: ['packages/javascript/src/node.ts'], platform: 'node', format,
    external: ['jsdom', 'dompurify'],
    outfile: `packages/javascript/dist/node.${format === 'esm' ? 'js' : 'cjs'}`,
  })),
  build({
    ...common, entryPoints: ['packages/javascript/src/cli.ts'], platform: 'node', format: 'esm',
    external: ['jsdom', 'dompurify'], outfile: 'packages/javascript/dist/cli.js',
  }),
]);

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/javascript/tsconfig.json'], {stdio: 'inherit'});
// Flatten generated declarations so neither public package depends on private workspace paths.
const dist = 'packages/javascript/dist';
for (const directory of ['javascript/src', 'shared/src']) {
  for (const name of await readdir(`${dist}/.types/${directory}`)) {
    if (!name.endsWith('.d.ts')) continue;
    const source = await readFile(`${dist}/.types/${directory}/${name}`, 'utf8');
    const text = source.replace(/(['"])(?:\.\.\/)+shared\/src\//g, '$1./');
    await writeFile(`${dist}/${name}`, text);
    await writeFile(`${dist}/${name.replace(/\.d\.ts$/, '.d.cts')}`,
      text.replace(/(['"]\.\/[^'"]+)\.js(['"])/g, '$1.cjs$2'));
  }
}
await rm(`${dist}/.types`, {recursive: true, force: true});
await chmod('packages/javascript/dist/cli.js', 0o755);
// Each tarball is self-contained, including all attribution files.
for (const name of ['LICENSE', 'NOTICE', 'UPSTREAM.md', 'PATCHES.md', 'upstream.json']) {
  await copyFile(name, `packages/javascript/${name}`);
}
await rm('packages/javascript/LICENSES', {recursive: true, force: true});
await mkdir('packages/javascript/LICENSES', {recursive: true});
for (const name of await readdir('LICENSES')) {
  await copyFile(`LICENSES/${name}`, `packages/javascript/LICENSES/${name}`);
}
const packageRequire = createRequire(new URL('../packages/javascript/package.json', import.meta.url));
const purifierLicense = join(dirname(packageRequire.resolve('dompurify')), '..', 'LICENSE');
await copyFile(purifierLicense, 'packages/javascript/LICENSES/DOMPurify-LICENSE.txt');
