#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {readFile, appendFile} from 'node:fs/promises';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Supply strict compatibility report paths.');
let failed = false;
let transportFailure = false;
const lines = ['Rust compatibility release gate', ''];
for (const path of paths) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.schema !== 1 || typeof report.passed !== 'boolean' || !Number.isInteger(report.compared) || report.compared <= 0 || !Array.isArray(report.differences) || report.passed !== (report.differences.length === 0)) {
    throw new Error(`Invalid strict report: ${path}`);
  }
  failed ||= !report.passed;
  transportFailure ||= report.differences.some(item => item.field === 'transportError');
  lines.push(`- ${path}: ${report.passed ? 'PASS' : 'FAIL'}; ${report.compared} cases; ${report.differences.length} field differences.`);
}
lines.push('', failed ? 'Release remains blocked. PR reporting does not certify compatibility.' : 'All supplied strict reports pass.');
const summary = `${lines.join('\n')}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (transportFailure || (failed && process.env.STRICT_RELEASE_GATE === 'true')) process.exitCode = 1;
