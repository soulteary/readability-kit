#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const folder=process.argv[2];
if(!folder)throw new Error('Usage: check-python-benchmark.mjs report-directory');
const summary=JSON.parse(readFileSync(`${folder}/summary.json`,'utf8'));
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let requests=0;await page.route('**/*',route=>{requests++;return route.abort()});
 await page.setContent(readFileSync(`${folder}/report.html`,'utf8'));
 const rows=[];
 for(const engine of ['chromium','mozilla']){
  await page.selectOption('#engine',engine);
  assert.equal(await page.locator('#fullrows tr').count(),4);
  assert.equal(await page.locator('#memory tr').count(),JSON.parse(readFileSync(`${folder}/memory-profile.json`,'utf8')).jobs.filter(j=>j.replicate===0).length);
  assert.equal(await page.locator('#details tr').count(),12);
  assert.equal(await page.locator('#phases tr').count(),8);
  assert.equal(await page.locator('#phaseDetails tr').count(),3);
  const ratio=summary.engines[engine].fullCorpusTimeRatios.pythonOverRust.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  assert.ok((await page.locator('#facts').innerText()).includes(ratio+'×'));
  rows.push(await page.locator('#fullrows').innerText());
 }
 assert.notEqual(rows[0],rows[1]);
 await page.selectOption('#engine','chromium');
 await page.screenshot({path:`${folder}/report.png`,fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(requests,0);
 console.log(JSON.stringify({passed:true,engines:2,implementations:4,detailRows:12,networkRequests:0,pageErrors:0,browser:browser.version()}));
} finally {await browser.close()}
