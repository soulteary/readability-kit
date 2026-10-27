// SPDX-License-Identifier: Apache-2.0
// Real Chromium reparse gate. Build the compat command, then run:
// READABILITY_GO_COMPAT_BIN=/absolute/path/to/compat node scripts/check-go-sanitizer.mjs
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {JSDOM} from 'jsdom';
import createDOMPurify from 'dompurify';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const cleanupModule = transformSync(readFileSync(new URL('../src/cleanup.ts', import.meta.url), 'utf8'), {loader: 'ts', format: 'esm', target: 'es2022'}).code;
const {cleanContent} = await import(`data:text/javascript;base64,${Buffer.from(cleanupModule).toString('base64')}`);

const binary = process.env.READABILITY_GO_COMPAT_BIN;
assert.ok(binary, 'Set READABILITY_GO_COMPAT_BIN to the built Go compatibility command.');
const prose = 'This investigation describes a useful observation, explains the measurements and provides substantial evidence for readers to assess the conclusion. '.repeat(15);
const payloads = [
  ['events and schemes', '<p><img src="https://example.invalid/broken" onerror="top.__goProbe++"><a href="jav&#97;script:top.__goProbe++">link</a><a href="java&#10;script:top.__goProbe++">encoded</a></p>'],
  ['script and document controls', '<script>top.__goProbe++</script><iframe srcdoc="<script>top.__goProbe++</script>"></iframe><object data="data:text/html,x"></object><meta http-equiv="refresh" content="0;url=https://example.invalid/navigation">'],
  ['styles and forms', '<p style="position:fixed" onclick="top.__goProbe++">Visible emphasis</p><form><input autofocus onfocus="top.__goProbe++"><button formaction="javascript:top.__goProbe++">send</button></form>'],
  ['svg namespace', '<svg><a xlink:href="javascript:top.__goProbe++"><text>link</text></a><g onload="top.__goProbe++"></g><foreignObject><img src=x onerror="top.__goProbe++"></foreignObject></svg>'],
  ['math namespace', '<math><annotation-xml encoding="text/html"><img src=x onerror="top.__goProbe++"></annotation-xml></math>'],
  ['namespace mutation', '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=top.__goProbe++>">'],
  ['responsive images', '<picture><source srcset="javascript:top.__goProbe++ 1x"><img src="https://example.invalid/photo" srcset="/safe.jpg 1x,javascript:top.__goProbe++ 2x" onerror="top.__goProbe++"></picture>'],
  ['safe foreign media', '<svg viewBox="0 0 10 10"><a href="https://example.test/reference"><text>Diagram</text></a><path d="M0 0L10 10"></path></svg><math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>'],
  ['data image', '<img alt="embedded" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 onload=%22top.__goProbe++%22/%3E">'],
  ['safe article media', '<figure><img src="https://example.invalid/photo" alt="safe image"><figcaption>Observation photograph</figcaption></figure><p><a href="https://example.test/reference">Reference</a><code>x &lt; y</code></p>'],
];

function extract(engine, payload, sanitize = true, layer = 'api') {
  const html = `<html><head><title>Go sanitizer browser gate</title></head><body><article><p>${prose}</p>${payload}<p>${prose}</p></article></body></html>`;
  const result = spawnSync(binary, [], {
    input: JSON.stringify({html, options: {url: 'https://example.test/story', engine, sanitize}, layer}),
    encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.status, 'ok', JSON.stringify(response));
  assert.ok(response.article.textContent.includes('This investigation describes'));
  return response.article.content;
}

const oracleWindow = new JSDOM('').window;
const purifier = createDOMPurify(oracleWindow);
function expectedContent(raw) {
  const cleaned = oracleWindow.document.createElement('div');
  cleaned.innerHTML = purifier.sanitize(raw, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
    FORBID_ATTR: ['style'],
  });
  cleanContent(cleaned);
  return cleaned.innerHTML;
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.READABILITY_TEST_CHROMIUM ? {executablePath: process.env.READABILITY_TEST_CHROMIUM} : {}),
});
let blockedRequests = 0;
let checks = 0;
try {
  const context = await browser.newContext();
  await context.route('**/*', route => { blockedRequests++; return route.abort(); });
  const page = await context.newPage();
  await page.goto('about:blank');
  await page.evaluate(() => { window.__goProbe = 0; });
  // Negative control: prove script execution and error handlers are observable
  // despite request blocking. No CSP is installed by this harness.
  await page.evaluate(async () => {
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
    frame.srcdoc = '<script>top.__goProbe++</script><img src="https://example.invalid/control" onerror="top.__goProbe++">';
    document.body.append(frame);
    await loaded;
  });
  await page.waitForFunction(() => window.__goProbe === 2);
  await page.evaluate(() => { document.body.replaceChildren(); window.__goProbe = 0; });
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });

  for (const engine of ['chromium', 'mozilla']) {
    let retainedAttackControls = 0;
    for (const [name, payload] of payloads) {
      const unsafe = extract(engine, payload, false);
      if (/\bon(?:error|click|load|focus)=|javascript:/i.test(unsafe)) retainedAttackControls++;
      const content = extract(engine, payload);
      const raw = extract(engine, payload, false, 'raw');
      const expected = expectedContent(raw);
      assert.equal(content, expected, `${engine}: ${name}: DOMPurify policy parity`);
      const issues = await page.evaluate(async content => {
        const inspect = root => {
          const issues = [];
          for (const node of root.querySelectorAll('*')) {
            if (!['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML'].includes(node.namespaceURI)) issues.push(`namespace:${node.namespaceURI}`);
            if (node.matches('script,style,iframe,object,embed,form,input,button,textarea,select,option,meta,base,link')) issues.push(node.localName);
            for (const attr of node.attributes) {
              if (/^on/i.test(attr.name) || ['style', 'srcdoc', 'formaction', 'action'].includes(attr.name)) issues.push(attr.name);
              if (['href', 'xlink:href', 'src', 'poster', 'cite'].includes(attr.name)) {
                const value = attr.value.replace(/[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000]/g, '');
                try {
                  const protocol = new URL(value, 'https://example.test/story').protocol;
                  const imageData = protocol === 'data:' && ['img', 'source', 'image', 'audio', 'video', 'track'].includes(node.localName) && ['src', 'href', 'xlink:href'].includes(attr.name);
                  if (!imageData && !['http:', 'https:', 'ftp:', 'ftps:', 'mailto:', 'tel:', 'callto:', 'sms:', 'cid:', 'xmpp:', 'matrix:'].includes(protocol)) issues.push(`${node.localName}:${attr.name}:${value}`);
                } catch { issues.push(attr.value); }
              }
              // DOMPurify preserves srcset. Its sink is image loading; actual
              // execution is checked below in both HTML and SVG namespaces.
            }
          }
          return issues;
        };
        const parsed = new DOMParser().parseFromString(content, 'text/html');
        const issues = inspect(parsed);
        document.body.innerHTML = content;
        issues.push(...inspect(document.body));
        // Document parsing executes script elements, unlike innerHTML alone.
        const frame = document.createElement('iframe');
        const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once: true}));
        frame.srcdoc = content;
        document.body.append(frame);
        await loaded;
        issues.push(...inspect(frame.contentDocument));
        for (const root of [document.body, frame.contentDocument]) {
          for (const node of root.querySelectorAll('*')) {
            for (const event of ['error', 'load', 'click', 'focus']) node.dispatchEvent(new Event(event));
            if (node.matches('a,area') && /^(?:javascript|vbscript):/i.test((node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '').replace(/[\u0000-\u0020]/g, ''))) node.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
          }
        }
        await new Promise(resolve => setTimeout(resolve, 50));
        frame.remove();
        return issues;
      }, content);
      assert.deepEqual(issues, [], `${engine}: ${name}`);
      assert.equal(await page.evaluate(() => window.__goProbe), 0, `${engine}: ${name}: execution`);
      assert.equal(navigations, 0, `${engine}: ${name}: main navigation`);
      if (name === 'safe foreign media') {
        assert.match(content, /<svg[ >]/);
        assert.match(content, /<math[ >]/);
      }
      if (name === 'safe article media') {
        assert.match(content, /alt="safe image"/);
        assert.match(content, /href="https:\/\/example.test\/reference"/);
      }
      checks++;
    }
    assert.ok(retainedAttackControls >= 3, `${engine}: extraction discarded too many attack controls to test sanitizer`);
  }
  console.log(JSON.stringify({status: 'passed', browser: browser.version(), checks, blockedRequests, negativeControlExecutions: 2}));
} finally {
  await browser.close();
}
