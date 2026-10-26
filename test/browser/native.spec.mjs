// SPDX-License-Identifier: Apache-2.0
// Set READABILITY_RUST_BIN to opt into the native sanitizer's real-browser gate.
import {spawnSync} from 'node:child_process';
import {test, expect} from '@playwright/test';

const binary = process.env.READABILITY_RUST_BIN;
test.skip(!binary, 'Build Rust and set READABILITY_RUST_BIN to run native browser checks.');
const prose = 'This article explains an observation in sufficient detail, preserving its context and giving readers useful evidence to evaluate the result. '.repeat(15);
const payloads = [
  '<img src="https://example.invalid/x" onerror="top.__nativeProbe++"><a href="javascript:top.__nativeProbe++">unsafe</a>',
  '<svg><a xlink:href="javascript:top.__nativeProbe++"><text>link</text></a><g onload="top.__nativeProbe++"></g></svg>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=top.__nativeProbe++>">',
  '<iframe srcdoc="<script>top.__nativeProbe++</script>"></iframe><object data="data:text/html,unsafe"></object>',
  '<p style="position:fixed" onclick="top.__nativeProbe++">Visible emphasis</p><form><input autofocus onfocus="top.__nativeProbe++"><button>send</button></form>',
  '<picture><source srcset="javascript:top.__nativeProbe++ 1x"><img srcset="javascript:top.__nativeProbe++ 1x, /safe.jpg 2x"></picture>',
];

for (const engine of ['mozilla', 'chromium']) {
  test(`native ${engine}: sanitizer survives Chromium fragment and document reparsing`, async ({page}) => {
    await page.route('**/*', route => route.abort());
    await page.goto('about:blank');
    await page.evaluate(() => { window.__nativeProbe = 0; });
    for (const payload of payloads) {
      const input = `<html><head><title>Native sanitizer browser gate</title></head><body><article><p>${prose}</p>${payload}<p>${prose}</p></article></body></html>`;
      const result = spawnSync(binary, ['-', '--url', 'https://example.test/story', '--engine', engine], {input, encoding: 'utf8', timeout: 30_000});
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const article = JSON.parse(result.stdout);
      expect(article.textContent).toContain('This article explains an observation');
      const violations = await page.evaluate(content => {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        const issues = [];
        for (const node of doc.querySelectorAll('*')) {
          if (node.matches('script,style,iframe,object,embed,form,input,button,textarea,select,option')) issues.push(node.localName);
          for (const attr of node.attributes) {
            if (/^on/i.test(attr.name) || attr.name === 'style') issues.push(attr.name);
            if (['href', 'src', 'xlink:href', 'srcset'].includes(attr.name) && /(?:javascript|vbscript):/i.test(attr.value.replace(/[\u0000-\u0020]/g, ''))) issues.push(attr.value);
          }
        }
        document.body.innerHTML = content;
        const iframe = document.createElement('iframe');
        iframe.srcdoc = content;
        document.body.append(iframe);
        return issues;
      }, article.content);
      expect(violations).toEqual([]);
      await expect.poll(() => page.evaluate(() => window.__nativeProbe)).toBe(0);
      await page.evaluate(async () => {
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentDocument?.readyState !== 'complete') await new Promise(resolve => iframe.addEventListener('load', resolve, {once: true}));
      });
      expect(await page.evaluate(() => window.__nativeProbe)).toBe(0);
    }
  });
}
