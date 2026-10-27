#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {chromium} from '@playwright/test';
const path=resolve(process.argv[2]||'docs/performance/2026-10-27/report.html');
const screenshotPath=resolve(process.argv[3]||'performance-reports/2026-10-27/report.png');
const html=readFileSync(path,'utf8');
const embedded=html.match(/const report=(.*);\nconst (?:compatibility|matchedSubset)=/);
assert.ok(embedded,'Report must contain its own summary JSON');
const report=JSON.parse(embedded[1]);
const compatibilityMatch=html.match(/const compatibility=(.*);\nconst matchedSubset=/);
const compatibility=compatibilityMatch?JSON.parse(compatibilityMatch[1]):null;
const engines=Object.keys(report.engines);
assert.equal(engines.length,2);
const implementations=Object.keys(report.startup).length;
const formatRatio=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:1,minimumFractionDigits:1})+'×';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;await page.route('**/*',route=>{requests++;return route.abort()});
 await page.setContent(html);
 await page.waitForFunction(()=>document.querySelectorAll('#detailTable tr').length>0);
 if(compatibility){
  const banner=await page.locator('.note').innerText();
  for(const language of ['go','rust'])assert.ok(banner.includes(compatibility[language].compared+' 项，'+compatibility[language].differences+' 项差异'));
  if(['go','rust'].every(k=>compatibility[k].passed))assert.ok(!banner.includes('输出仍有差异'));
 }
 const rendered=[];
 for(const engine of engines){
  await page.selectOption('#engine',engine);
  const expected=report.engines[engine];
  assert.equal(await page.locator('#fullTable tr').count(),implementations);
  assert.equal(await page.locator('#fullTime .bar').count(),implementations);
  assert.ok((await page.locator('#stats').innerText()).includes(formatRatio(expected.fullCorpusTimeRatios.javascriptOverGo)));
  assert.equal(await page.locator('#detailTable tr').count(),Object.keys(expected.detail).length*implementations);
  for(const language of ['go','rust']){
   const correctness=expected.fullTextCorrectness[language];
   assert.ok((await page.locator('#correctness').innerText()).includes(correctness.matchingPages+'/'+correctness.comparedPages));
  }
  rendered.push(await page.locator('#fullTable').innerText());
 }
 assert.notEqual(rendered[0],rendered[1]);
 await page.selectOption('#engine',engines[0]);
 mkdirSync(dirname(screenshotPath),{recursive:true});
 await page.screenshot({path:screenshotPath,fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(requests,0);
 console.log(JSON.stringify({status:'passed',browser:browser.version(),detailRows:Object.keys(report.engines[engines[0]].detail).length*implementations,implementations,engines:engines.length,networkRequests:requests,pageErrors:errors.length}));
}finally{await browser.close()}
