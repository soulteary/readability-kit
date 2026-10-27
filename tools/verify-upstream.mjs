import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const manifest = JSON.parse(await readFile('upstream.json', 'utf8'));
const failures = [];
for (const entry of manifest.files) {
  try {
    const digest = createHash('sha256').update(await readFile(entry.path)).digest('hex');
    if (digest !== entry.sha256) failures.push(`${entry.path}: source bytes changed`);
  } catch (error) {
    failures.push(`${entry.path}: ${error.message}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Verified ${manifest.files.length} pinned upstream files (SHA-256).`);

// Source archives need no .git directory. Full Git clones can additionally
// verify that original upstream commit objects are reachable from this branch.
let insideGit = false;
try {
  insideGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() === 'true';
} catch { /* A downloaded source archive has no history to verify. */ }
if (insideGit) {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {encoding: 'utf8'}).trim();
  if (shallow === 'true') {
    console.log('Shallow clone: source hashes verified; fetch full history to verify ancestry.');
  } else {
    const revision = manifest.sources.mozilla.revision;
    execFileSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD']);
    const count = Number(execFileSync('git', ['rev-list', '--count', revision], {encoding: 'utf8'}));
    const tree = execFileSync('git', ['rev-parse', `${revision}^{tree}`], {encoding: 'utf8'}).trim();
    if (count !== manifest.sources.mozilla.originalCommitCount || tree !== manifest.sources.mozilla.tree) {
      throw new Error('Mozilla commit count or original tree does not match upstream.json.');
    }
    console.log(`Verified ${count} original Mozilla commits in the current ancestry.`);
  }
}
