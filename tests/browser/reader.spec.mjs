// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test';

const paragraph = 'Thoughtful reading preserves the details that connect an observation to its explanation. A useful article gives the reader enough context to assess the result, follow its sources, and decide what to do next. ';

function articleHTML(extra = '', head = '') {
  return `<!doctype html><html lang="en"><head><title>Browser integration article</title>${head}</head><body><article><h1>Browser integration article</h1><p>${paragraph.repeat(5)}</p>${extra}<p>${paragraph.repeat(5)}</p></article></body></html>`;
}

async function readResult(page) {
  return JSON.parse(await page.locator('#json-output').textContent());
}

async function extractInput(page, html, url = 'https://example.test/articles/story.html') {
  await page.locator('#source-url').fill(url);
  await page.locator('#source-html').fill(html);
  await page.getByRole('button', { name: 'Extract article' }).click();
  await expect(page.locator('#status')).toHaveClass(/success/);
  return readResult(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/examples/reader/');
  await expect(page.locator('#source-html')).not.toHaveValue('');
});

test('the default demo renders the sample article and metadata', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.getByRole('button', { name: 'Extract article' }).click();
  await expect(page.locator('#status')).toHaveClass(/success/);
  await expect(page.locator('#engine-badge')).toHaveText('Chromium');
  const preview = page.frameLocator('#reader-frame');
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Making room for a quieter kind of reading');
  await expect(preview.getByRole('heading', { name: 'Keep the structure that carries meaning' })).toBeVisible();
  await expect(page.locator('#metadata')).toContainText('Alex Morgan');
  await expect(page.locator('#copy-button')).toBeEnabled();
  const result = await readResult(page);
  expect(result.engine).toBe('chromium');
  expect(result.length).toBeGreaterThan(1500);
  expect(result.url).toBe('https://example.com/stories/quiet-reading');
  expect(pageErrors).toEqual([]);
});

test('the demo switches between both engines and exposes reusable output', async ({ page }) => {
  for (const engine of ['mozilla', 'chromium']) {
    await page.locator('#engine').selectOption(engine);
    await page.getByRole('button', { name: 'Extract article' }).click();
    await expect(page.locator('#status')).toHaveClass(/success/);
    const result = await readResult(page);
    expect(result.engine).toBe(engine);
    expect(result.textContent).toContain('A small, repeatable workflow');
    await page.getByRole('tab', { name: 'HTML', exact: true }).click();
    await expect(page.locator('#html-output')).toBeVisible();
    await expect(page.locator('#html-output')).toContainText('<table>');
    await page.getByRole('tab', { name: 'JSON', exact: true }).click();
    await expect(page.locator('#json-output')).toBeVisible();
    await expect(page.locator('#json-output')).toContainText(`"engine": "${engine}"`);
  }
});

test('untrusted HTML is sanitized and does not execute or load remote media', async ({ page }) => {
  await page.evaluate(() => { window.__readabilityProbe = 0; });
  const remoteRequests = [];
  // A CSP-blocked image can still emit Playwright's high-level request event.
  // Interception records requests that actually reach the network layer and
  // prevents the test from sending one if the preview policy regresses.
  await page.route('https://example.invalid/**', (route) => {
    remoteRequests.push(route.request().url());
    return route.abort();
  });
  const result = await extractInput(page, articleHTML(`
    <script>window.top.__readabilityProbe += 1</script>
    <p onclick="window.top.__readabilityProbe += 1">Keep this safe paragraph.</p>
    <figure><img src="https://example.invalid/tracker.png" onerror="window.top.__readabilityProbe += 1"><figcaption>A photograph with a caption to preserve in the extracted article.</figcaption></figure>
    <a href="javascript:window.top.__readabilityProbe += 1">An unsafe link</a>
    <svg onload="window.top.__readabilityProbe += 1"></svg>
    <iframe srcdoc="&lt;script&gt;window.top.__readabilityProbe += 1&lt;/script&gt;"></iframe>
    <form action="https://example.invalid/submit"><input autofocus onfocus="window.top.__readabilityProbe += 1"><button>Submit</button></form>
  `));

  const unsafeOutput = await page.evaluate((content) => {
    const document = new DOMParser().parseFromString(content, 'text/html');
    return {
      activeElements: document.querySelectorAll('script, iframe, form, input, button, object, embed').length,
      eventAttributes: [...document.querySelectorAll('*')].flatMap((element) =>
        [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).map((attribute) => attribute.name)),
      scriptLinks: [...document.querySelectorAll('[href]')].filter((element) =>
        /^\s*javascript:/i.test(element.getAttribute('href'))).length,
    };
  }, result.content);
  expect(unsafeOutput).toEqual({ activeElements: 0, eventAttributes: [], scriptLinks: 0 });
  expect(result.textContent).toContain('Keep this safe paragraph.');
  await expect(page.frameLocator('#reader-frame').locator('body > article')).toContainText('Keep this safe paragraph.');
  expect(await page.evaluate(() => window.__readabilityProbe)).toBe(0);
  expect(remoteRequests).toEqual([]);
});

test('a supplied source URL resolves links in DOMParser input without changing it', async ({ page }) => {
  const sourceURL = 'https://news.example.test/reports/2026/story.html';
  const html = articleHTML(`
    <p><a href="../notes?view=full#detail">Read the supporting notes</a></p>
    <figure><img class="lazy" data-src="./lazy.jpg" data-srcset="./small.jpg 1x, ../large.jpg 2x" alt="A detailed illustration inside the article"><figcaption>An illustration with lazy image sources.</figcaption></figure>
  `, '<base href="../assets/">').replace('<article>', '<figure class="hero"><img src="./hero.jpg" alt="A landscape introducing the story"><figcaption>The lead photograph.</figcaption></figure><article>');
  const result = await page.evaluate(async ({ html, sourceURL }) => {
    const { extractDocument } = await import('/packages/javascript/dist/index.js');
    const source = new DOMParser().parseFromString(html, 'text/html');
    const before = source.documentElement.outerHTML;
    const article = extractDocument(source, { url: sourceURL });
    return { article, unchanged: before === source.documentElement.outerHTML };
  }, { html, sourceURL });
  expect(result.unchanged).toBe(true);
  expect(result.article.url).toBe(sourceURL);
  const links = await page.evaluate((content) => {
    const document = new DOMParser().parseFromString(content, 'text/html');
    return {
      href: document.querySelector('a').getAttribute('href'),
      images: [...document.querySelectorAll('img')].map((image) => ({
        src: image.getAttribute('src'), srcset: image.getAttribute('srcset'),
      })),
    };
  }, result.article.content);
  expect(links.href).toBe('https://news.example.test/reports/notes?view=full#detail');
  expect(links.images).toContainEqual({ src: 'https://news.example.test/reports/assets/hero.jpg', srcset: null });
  expect(links.images).toContainEqual({
    src: 'https://news.example.test/reports/assets/lazy.jpg',
    srcset: 'https://news.example.test/reports/assets/small.jpg 1x, https://news.example.test/reports/large.jpg 2x',
  });

  const demoResult = await extractInput(page, articleHTML('<p><a href="../notes">Read the supporting notes</a></p>'), sourceURL);
  expect(demoResult.url).toBe(sourceURL);
  expect(demoResult.content).toContain('href="https://news.example.test/reports/notes"');
});

test('live documents flatten open shadow roots and slots across browser realms', async ({ page }) => {
  const result = await page.evaluate(async (paragraph) => {
    const { extractDocument } = await import('/packages/javascript/dist/index.js');
    const iframe = document.createElement('iframe');
    iframe.srcdoc = '<!doctype html><html><head><title>Live shadow article</title></head><body></body></html>';
    const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
    document.body.append(iframe);
    await loaded;
    const source = iframe.contentDocument;
    const host = source.createElement('x-reader-article');
    source.body.append(host);
    host.innerHTML = `<p slot="body">ASSIGNED_CONTENT ${paragraph.repeat(5)}</p><p>UNASSIGNED_CONTENT</p>`;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<article><h1>Live shadow article</h1><p>SHADOW_INTRO ${paragraph.repeat(5)}</p><slot name="body"></slot><slot name="unused"><p>VISIBLE_FALLBACK ${paragraph}</p></slot><x-nested></x-nested><template><p>INERT_TEMPLATE_CONTENT</p></template></article>`;
    const nested = shadow.querySelector('x-nested').attachShadow({ mode: 'open' });
    nested.innerHTML = `<p>NESTED_SHADOW_CONTENT ${paragraph.repeat(2)}</p>`;
    const closedHost = source.createElement('x-closed-article');
    source.body.append(closedHost);
    closedHost.attachShadow({ mode: 'closed' }).innerHTML = `<p>CLOSED_ROOT_CONTENT ${paragraph}</p>`;
    const before = { light: host.outerHTML, shadow: shadow.innerHTML, nested: nested.innerHTML };
    const article = extractDocument(source, { url: 'https://example.test/live' });
    const lightOnly = extractDocument(source, { url: 'https://example.test/live', flattenShadowRoots: false });
    const unchanged = before.light === host.outerHTML && before.shadow === shadow.innerHTML && before.nested === nested.innerHTML;
    iframe.remove();
    return { article, lightOnly, unchanged };
  }, paragraph);
  expect(result.unchanged).toBe(true);
  expect(result.article.textContent).toContain('SHADOW_INTRO');
  expect(result.article.textContent).toContain('VISIBLE_FALLBACK');
  expect(result.article.textContent).toContain('NESTED_SHADOW_CONTENT');
  expect(result.article.textContent.match(/ASSIGNED_CONTENT/g)).toHaveLength(1);
  expect(result.article.textContent).not.toContain('UNASSIGNED_CONTENT');
  expect(result.article.textContent).not.toContain('INERT_TEMPLATE_CONTENT');
  expect(result.article.textContent).not.toContain('CLOSED_ROOT_CONTENT');
  expect(result.lightOnly?.textContent ?? '').not.toContain('NESTED_SHADOW_CONTENT');
});
