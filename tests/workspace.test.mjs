import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {isBuiltin} from 'node:module';
import {dirname, join, matchesGlob, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {buildSync} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = directory => JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8'));
const rootManifest = manifest('.');
const packageDirectories = ['packages/javascript', 'packages/shared', 'packages/wasm'];
const packages = new Map(packageDirectories.map(directory => [directory, manifest(directory)]));
const sourceFiles = [];
function collect(directory) {
  for (const entry of readdirSync(join(root, directory), {withFileTypes: true})) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(path);
    else if (/\.(?:mjs|js|ts)$/.test(entry.name)) sourceFiles.push(path);
  }
}
for (const directory of ['tools', 'tests', 'packages/javascript/src', 'packages/javascript/test',
  'packages/shared/src', 'packages/wasm/src', 'docs/pr-validation']) collect(directory);

test('release packages declare their shared build dependency without publishing a runtime workspace dependency', () => {
  assert.equal(rootManifest.private, true);
  assert.equal(packages.get('packages/shared').private, true);
  for (const directory of ['packages/javascript', 'packages/wasm']) {
    const pkg = packages.get(directory);
    assert.notEqual(pkg.private, true);
    assert.equal(pkg.repository.directory, directory);
    assert.equal(pkg.devDependencies[packages.get('packages/shared').name], 'workspace:*');
    for (const range of Object.values(pkg.dependencies ?? {})) {
      assert.doesNotMatch(range, /^(?:workspace:|file:|link:)/);
    }
  }
});

test('first-party imports resolve and external imports have an explicit owner dependency', () => {
  for (const file of sourceFiles) {
    const ownerDirectory = packageDirectories.find(directory => file.startsWith(`${directory}/`));
    const owner = ownerDirectory ? packages.get(ownerDirectory) : rootManifest;
    const {metafile} = buildSync({
      stdin: {contents: readFileSync(join(root, file), 'utf8'), sourcefile: file, loader: file.endsWith('.ts') ? 'ts' : 'js'},
      metafile: true, write: false, logLevel: 'silent', format: 'esm',
    });
    function check(specifier) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        // Browser imports and tests of generated entries are resolved by build/package checks.
        const browserPath = specifier.startsWith('/pkg/') ? `/packages/wasm${specifier}` : specifier;
        const target = browserPath.startsWith('/') ? join(root, browserPath) : resolve(root, dirname(file), specifier);
        const local = relative(root, target).split(sep).join('/');
        if (/^packages\/(?:javascript\/dist|wasm\/pkg)\//.test(local)) return;
        assert.ok(existsSync(target) || (target.endsWith('.js') && existsSync(target.slice(0, -3) + '.ts')),
          `${file}: missing source import ${specifier}`);
        const targetDirectory = packageDirectories.find(directory => local.startsWith(`${directory}/`));
        if (ownerDirectory && targetDirectory && ownerDirectory !== targetDirectory) {
          const targetPackage = packages.get(targetDirectory).name;
          assert.ok(owner.dependencies?.[targetPackage] || owner.devDependencies?.[targetPackage],
            `${file}: undeclared cross-package import ${targetPackage}`);
        }
        return;
      }
      if (isBuiltin(specifier) || /^(?:https?:|data:)/.test(specifier)) return;
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      const dependencies = {...owner.dependencies, ...owner.devDependencies};
      // Tests use the repository's declared test runner/toolchain.
      if (file.includes('/test/')) Object.assign(dependencies, rootManifest.devDependencies);
      assert.ok(dependencies[name], `${file}: undeclared external import ${name}`);
    }
    for (const output of Object.values(metafile.outputs)) {
      for (const dependency of output.imports) check(dependency.path);
    }
  }
});

test('filtered workflows cover shared build inputs and Rust browser example inputs', () => {
  const sharedInputs = ['packages/javascript/src/index.ts', 'packages/javascript/package.json',
    'packages/javascript/tsconfig.json', 'packages/shared/src/types.ts', 'packages/shared/package.json',
    'packages/wasm/package.json', 'tools/build.mjs', 'tools/compatibility.mjs',
    'tests/compatibility-fixtures.json', 'package.json', 'bun.lock', 'playwright.config.mjs',
    'LICENSES/DOMPurify-LICENSE.txt', 'NOTICE', 'UPSTREAM.md', 'PATCHES.md', 'upstream.json'];
  for (const file of ['rust.yml', 'wasm.yml']) {
    const contents = readFileSync(join(root, '.github/workflows', file), 'utf8');
    const filters = [...contents.matchAll(/^\s+paths: \[(.+)\]$/gm)];
    assert.equal(filters.length, 2, `${file}: expected push and pull_request filters`);
    const inputs = file === 'rust.yml' ? [...sharedInputs, 'examples/reader/app.js', 'examples/reader/index.html'] : sharedInputs;
    for (const [, values] of filters) {
      const patterns = [...values.matchAll(/'([^']+)'/g)].map(match => match[1]);
      for (const input of inputs) assert.ok(patterns.some(pattern => matchesGlob(input, pattern)), `${file}: skipped dependency ${input}`);
    }
  }
});

test('CI commands point to existing repository tools', () => {
  for (const file of readdirSync(join(root, '.github/workflows'))) {
    const contents = readFileSync(join(root, '.github/workflows', file), 'utf8');
    for (const [, command] of contents.matchAll(/\b(?:node|python3?) (\S+\.(?:mjs|py))/g)) {
      assert.ok(existsSync(join(root, command)), `${file}: missing command ${command}`);
    }
  }
});
