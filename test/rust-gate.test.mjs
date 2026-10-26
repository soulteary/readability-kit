import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Rust gate publishes PR differences, blocks release and treats transport errors as failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'readability-gate-'));
  try {
    const report = join(directory, 'report.json');
    const summary = join(directory, 'summary.md');
    const run = strict => spawnSync(process.execPath, ['scripts/report-rust-gate.mjs', report], {
      encoding: 'utf8', env: {...process.env, STRICT_RELEASE_GATE: String(strict), GITHUB_STEP_SUMMARY: summary},
    });
    await writeFile(report, JSON.stringify({schema: 1, passed: false, compared: 2, differences: [{field: 'content'}]}));
    assert.equal(run(false).status, 0);
    assert.match(await readFile(summary, 'utf8'), /FAIL.*2 cases/);
    assert.equal(run(true).status, 1);
    await writeFile(report, JSON.stringify({schema: 1, passed: false, compared: 2, differences: [{field: 'transportError'}]}));
    assert.equal(run(false).status, 1);
    await writeFile(report, JSON.stringify({schema: 1, passed: true, compared: 2, differences: [{field: 'content'}]}));
    assert.notEqual(run(false).status, 0, 'inconsistent passed flags must fail');
    await writeFile(report, JSON.stringify({schema: 1, passed: true, compared: 2, differences: []}));
    assert.equal(run(true).status, 0);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
