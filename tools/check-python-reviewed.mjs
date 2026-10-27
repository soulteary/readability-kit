#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const folder = process.argv[2];
if (!folder) throw new Error('Usage: check-python-reviewed.mjs report-directory');
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  const errors = [];
  let requests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(readFileSync(`${folder}/report.html`, 'utf8'));
  const rows = [];
  for (const engine of ['chromium', 'mozilla']) {
    await page.selectOption('#engine', engine);
    for (const [id, count] of Object.entries({paired: 3, versionCLI: 9, versionStartup: 3, regressionRows: 2})) {
      assert.equal(await page.locator(`#${id} tr`).count(), count);
      assert.doesNotMatch(await page.locator(`#${id}`).innerText(), /undefined|NaN/);
    }
    assert.match(await page.locator('#paired').innerText(), /优化后 \/ 审查前/);
    rows.push(await page.locator('#regressionRows').innerText());
  }
  assert.notEqual(rows[0], rows[1]);
  await page.selectOption('#engine', 'chromium');
  await page.screenshot({path: `${folder}/report.png`, fullPage: true});
  assert.deepEqual(errors, []);
  assert.equal(requests, 0);
  console.log(JSON.stringify({passed: true, engines: 2, versions: 3, regressionRows: 2, requests, pageErrors: errors.length}));
} finally { await browser.close(); }
