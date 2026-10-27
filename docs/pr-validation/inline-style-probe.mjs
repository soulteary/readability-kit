// Run from the repository root: node docs/pr-validation/inline-style-probe.mjs
// These are API-level observations against the pinned JavaScript implementation.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {extractHTML, isProbablyReaderable} from '../../packages/javascript/dist/node.js';
const cases = [
  ['display:none;display:block', true, true],
  ['display:none;display:invalid', false, false],
  ['display:none!important;display:block!important', false, false],
  ['display:block!important;display:none!important', true, true],
  ['DISPLAY:NONE', true, true],
  ['display:none;display:xvar(--x)', false, false],
  ['display:none;display:VAR(--x)', false, false],
  ["display:none;display:'var(--x)'", false, false],
  ['display:none;display:var(--x)', true, true],
  ['visibility:hidden;visibility:xvar(--x)', false, true],
  ['visibility:hidden;visibility:VAR(--x)', false, true],
  ["visibility:hidden;visibility:'var(--x)'", false, true],
  ['visibility:hidden;visibility:var(--x)', true, true],
  ['display:/* note */none', false, false],
  ["background:url('display:none;');display:block", true, true],
  ['visibility:hidden;visibility:visible', true, true],
  ['visibility:hidden;visibility:invalid', false, true],
  ['visibility:hidden!important;visibility:visible!important', false, true],
];
for (const engine of ['chromium', 'mozilla']) {
  for (const [style, extraction, readerability] of cases) {
    const input = `<html><body><p style="${style}">${'A complete article sentence, with substantive details. '.repeat(40)}</p></body></html>`;
    const dom = new JSDOM(input);
    try {
      const article = extractHTML(input, {engine, url:'https://example.org/', charThreshold:1});
      const readable = isProbablyReaderable(dom.window.document, {engine});
      assert.equal(article !== null, extraction, `${engine}: extraction ${style}`);
      assert.equal(readable, readerability, `${engine}: readerability ${style}`);
      console.log(JSON.stringify({engine, style, display:dom.window.document.querySelector('p').style.display, extraction:article !== null, readerability:readable}));
    } finally { dom.window.close(); }
  }
}
