import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {extractDocument, isProbablyReaderable} from '../dist/index.js';
import {extractHTML} from '../dist/node.js';

const SOURCE_URL = 'https://example.test/news/story.html';
const TITLE = 'A Practical Guide to Reliable Article Extraction';
const PARAGRAPHS = [
  'A useful article extractor preserves the text that a reader came to find. ' +
    'Navigation and subscription widgets can occupy most of a page, while the ' +
    'actual explanation lives in several ordinary paragraphs. Keeping those ' +
    'paragraphs in order makes the result understandable without its original layout.',
  'The source address is part of that context. A relative link to another guide ' +
    'and a relative image address should still point to the original website. ' +
    'A local reading tool can resolve these references without downloading the ' +
    'linked pages or running any scripts supplied by the publisher.',
  'Different extraction engines make different decisions about surrounding ' +
    'material. A practical comparison uses the same document and records the ' +
    'resulting text, rather than assuming that either engine succeeds on every ' +
    'website. Focused examples help explain a change when an upstream patch arrives.',
  'Finally, extracted markup needs its own handling before it is displayed. ' +
    'An article algorithm chooses content; a sanitizer deals with unsafe markup. ' +
    'The source document should remain available to the caller so another pass ' +
    'can use different settings without reloading or silently changing the input.',
];

function articleHTML({head = '', body = '', paragraphs = PARAGRAPHS} = {}) {
  return `<!doctype html><html lang="en" dir="ltr"><head>
    <title>${TITLE}</title>
    <meta name="author" content="Ada Example">
    <meta name="description" content="An original fixture about extracting articles safely.">
    <meta property="og:site_name" content="Documentation Lab">
    <meta property="article:published_time" content="2026-10-20T08:00:00Z">
    ${head}</head><body>
    <nav><a href="/">Home</a><a href="/topics">Topics</a></nav>
    <main><article><h1>${TITLE}</h1>
    ${paragraphs.map(text => `<p>${text}</p>`).join('\n')}
    ${body}</article></main><footer>Other sections</footer></body></html>`;
}

function withDOM(html, callback, url = SOURCE_URL) {
  const dom = new JSDOM(html, {url});
  try {
    return callback(dom.window.document, dom);
  } finally {
    dom.window.close();
  }
}

for (const engine of ['chromium', 'mozilla']) {
  test(`${engine}: metadata and final text stay consistent`, () => {
    const result = extractHTML(articleHTML({
      body: '<p>Entity checks: bread &amp; butter, 中文内容, and a compass 🧭.</p>',
    }), {url: SOURCE_URL, engine});
    assert.ok(result);
    assert.equal(result.engine, engine);
    assert.equal(result.url, SOURCE_URL);
    assert.equal(result.title, TITLE);
    assert.equal(result.byline, 'Ada Example');
    assert.equal(result.siteName, 'Documentation Lab');
    assert.equal(result.publishedTime, '2026-10-20T08:00:00Z');
    assert.equal(result.lang, 'en');
    assert.equal(result.dir, 'ltr');
    assert.equal(result.excerpt, 'An original fixture about extracting articles safely.');
    assert.match(result.textContent, /bread & butter, 中文内容/);
    assert.equal(result.length, result.textContent.length);
    withDOM(result.content, document => {
      assert.equal(result.textContent, document.body.textContent);
    });
    assert.ok(result.textContent.indexOf(PARAGRAPHS[0]) < result.textContent.indexOf(PARAGRAPHS[3]));
  });

  test(`${engine}: relative links and source base URL resolve without changing input`, () => {
    const html = articleHTML({
      head: '<base href="../assets/">',
      body: '<p>See the <a href="guide.html">complete guide</a> for details. ' +
        '<img src="diagram.png" alt="Article diagram"></p>',
    });
    withDOM(html, (document, dom) => {
      const before = dom.serialize();
      const override = 'https://replacement.test/articles/new.html';
      const result = extractDocument(document, {engine, url: override});
      assert.ok(result);
      assert.equal(result.url, override);
      assert.match(result.content, /href="https:\/\/replacement\.test\/assets\/guide\.html"/);
      assert.match(result.content, /src="https:\/\/replacement\.test\/assets\/diagram\.png"/);
      assert.equal(dom.serialize(), before);
      assert.equal(document.URL, SOURCE_URL);
      assert.equal(document.querySelector('base').getAttribute('href'), '../assets/');
    });

    const withoutBase = extractHTML(articleHTML({
      body: '<p>Read the <a href="../guide.html">related guide</a> and inspect ' +
        '<img src="./image.png" alt="A diagram">.</p>',
    }), {url: SOURCE_URL, engine});
    assert.ok(withoutBase);
    assert.match(withoutBase.content, /href="https:\/\/example\.test\/guide\.html"/);
    assert.match(withoutBase.content, /src="https:\/\/example\.test\/news\/image\.png"/);

    const invalidBase = extractHTML(articleHTML({
      head: '<base href="javascript:void(0)">',
      body: '<p><a href="details.html">More source details</a> ' +
        '<a href="#section">An internal section</a></p>',
    }), {url: SOURCE_URL, engine});
    assert.ok(invalidBase);
    assert.match(invalidBase.content, /href="https:\/\/example\.test\/news\/details\.html"/);
    assert.match(invalidBase.content, /href="#section"/);
  });

  test(`${engine}: HTML is sanitized by default and opting out is explicit`, () => {
    const html = articleHTML({body: `<p>
      <img src="/diagram.png" alt="Diagram" onerror="alert('unsafe')">
      <a href="javascript:alert('unsafe')" onclick="alert('click')">Unsafe link label</a>
      <strong onclick="alert('event')" style="position:fixed">Visible emphasis</strong>
      </p><script>document.body.textContent = 'SCRIPT_EXECUTED';</script>`});
    const safe = extractHTML(html, {url: SOURCE_URL, engine});
    const raw = extractHTML(html, {url: SOURCE_URL, engine, sanitize: false});
    assert.ok(safe);
    assert.ok(raw);
    withDOM(safe.content, document => {
      assert.equal(document.querySelector('script, iframe, object, embed'), null);
      assert.equal(document.querySelector('[onclick], [onerror], [style]'), null);
      for (const anchor of document.querySelectorAll('a[href]')) {
        assert.notEqual(new URL(anchor.href).protocol, 'javascript:');
      }
    });
    assert.doesNotMatch(safe.content, /javascript:|SCRIPT_EXECUTED/);
    assert.match(safe.textContent, /Visible emphasis/);
    assert.match(raw.content, /onerror=/);
    assert.match(raw.content, /onclick=/);
  });

  test(`${engine}: a negative readerability hint does not block extraction`, () => {
    const html = '<!doctype html><title>A brief field note</title><p>' +
      'This brief field note describes a small but useful result, with enough ' +
      'context to understand the observation.</p>';
    withDOM(html, document => {
      assert.equal(isProbablyReaderable(document, {engine}), false);
      const result = extractDocument(document, {engine, charThreshold: 1});
      assert.ok(result);
      assert.match(result.textContent, /brief field note/);
    });
    assert.equal(extractHTML('<!doctype html><title>Empty</title><body></body>', {
      url: SOURCE_URL, engine,
    }), null);
  });

  test(`${engine}: cleanup preserves prose, image wrappers, and word separators`, () => {
    const html = articleHTML({body: `
      <p>Sponsored</p><p role="status">STATUS_ANNOUNCEMENT</p>
      <p>This article is sponsored by a public research grant.</p>
      <p>Words<span> </span>stay<span> </span>separate. <span aria-live="off">OFF_LIVE_PROSE</span></p>
      <figure><img src="/cleanup.png" alt="A useful figure"><figcaption>Figure caption.</figcaption></figure>
      <div><span> </span></div>`});
    const result = extractHTML(html, {url: SOURCE_URL, engine});
    assert.ok(result);
    assert.doesNotMatch(result.textContent, /STATUS_ANNOUNCEMENT/);
    assert.match(result.textContent, /This article is sponsored by a public research grant\./);
    assert.match(result.textContent, /Words stay separate\./);
    assert.match(result.textContent, /OFF_LIVE_PROSE/);
    withDOM(result.content, document => {
      assert.ok(document.querySelector('figure img[src="https://example.test/cleanup.png"]'));
      assert.ok(document.querySelector('figcaption'));
      assert.equal(Array.from(document.querySelectorAll('p')).some(p => p.textContent.trim() === 'Sponsored'), false);
    });
  });

  test(`${engine}: open shadow trees flatten assigned slots, fallback, and nested roots`, () => {
    withDOM(`<!doctype html><title>${TITLE}</title><article id="host">
      <p slot="intro">ASSIGNED_INTRO ${PARAGRAPHS[0]}</p>
      <p>UNASSIGNED_LIGHT_CONTENT ${PARAGRAPHS[1]}</p>
      </article>`, (document, dom) => {
      const host = document.querySelector('#host');
      const root = host.attachShadow({mode: 'open'});
      root.innerHTML = `<h1>${TITLE}</h1><slot name="intro"></slot>
        <section id="nested"></section>
        <slot name="missing"><p>FALLBACK_BODY ${PARAGRAPHS[2]}</p></slot>
        <p>${PARAGRAPHS[3]}</p>
        <template><p>TEMPLATE_HIDDEN_CONTENT</p></template>`;
      const nested = root.querySelector('#nested').attachShadow({mode: 'open'});
      nested.innerHTML = `<p>NESTED_SHADOW_BODY ${PARAGRAPHS[1]}</p>`;
      // SVG elements with HTML-like names must not be mistaken for HTML slots.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const svgSlot = document.createElementNS('http://www.w3.org/2000/svg', 'slot');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = 'SVG_NAMESPACE_CONTENT';
      svgSlot.append(text);
      svg.append(svgSlot);
      root.append(svg);

      const beforeLight = dom.serialize();
      const beforeShadow = root.innerHTML;
      const result = extractDocument(document, {engine, sanitize: false});
      assert.ok(result);
      assert.equal(result.textContent.split('ASSIGNED_INTRO').length - 1, 1);
      assert.match(result.textContent, /NESTED_SHADOW_BODY/);
      assert.match(result.textContent, /FALLBACK_BODY/);
      assert.match(result.textContent, /SVG_NAMESPACE_CONTENT/);
      assert.doesNotMatch(result.textContent, /UNASSIGNED_LIGHT_CONTENT|TEMPLATE_HIDDEN_CONTENT/);
      assert.equal(dom.serialize(), beforeLight);
      assert.equal(root.innerHTML, beforeShadow);
      assert.equal(root.querySelector('template').content.textContent, 'TEMPLATE_HIDDEN_CONTENT');

      const lightOnly = extractDocument(document, {engine, flattenShadowRoots: false});
      assert.ok(lightOnly);
      assert.match(lightOnly.textContent, /UNASSIGNED_LIGHT_CONTENT/);
      assert.doesNotMatch(lightOnly.textContent, /NESTED_SHADOW_BODY|FALLBACK_BODY/);
    });
  });
}

test('Node parsing does not run inline scripts or fetch external resources', async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(200, {'Content-Type': 'text/javascript'});
    response.end("document.body.textContent = 'REMOTE_SCRIPT_EXECUTED'");
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const html = articleHTML({
      head: `<script src="${origin}/script.js"></script><link rel="stylesheet" href="${origin}/style.css">`,
      body: `<p id="stable">UNCHANGED_BY_SCRIPT ${PARAGRAPHS[0]}</p>
        <img src="${origin}/image.png" alt="Diagram"><iframe src="${origin}/frame"></iframe>
        <script>document.querySelector('#stable').textContent = 'INLINE_SCRIPT_EXECUTED';</script>`,
    });
    const result = extractHTML(html, {url: `${origin}/story`});
    assert.ok(result);
    assert.match(result.textContent, /UNCHANGED_BY_SCRIPT/);
    assert.doesNotMatch(result.textContent, /INLINE_SCRIPT_EXECUTED|REMOTE_SCRIPT_EXECUTED/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Chromium keeps continue-read-break paragraphs while still removing ad-break blocks', () => {
  const html = articleHTML({body:
    `<p class="continue-read-break">CONTINUATION_PARAGRAPH ${PARAGRAPHS[0]}</p>` +
    `<p class="ad-break">AD_BREAK_CONTENT ${PARAGRAPHS[1]}</p>`,
  });
  const chromium = extractHTML(html, {url: SOURCE_URL, engine: 'chromium'});
  const mozilla = extractHTML(html, {url: SOURCE_URL, engine: 'mozilla'});
  assert.ok(chromium);
  assert.ok(mozilla);
  assert.match(chromium.textContent, /CONTINUATION_PARAGRAPH/);
  assert.doesNotMatch(chromium.textContent, /AD_BREAK_CONTENT/);
  assert.doesNotMatch(mozilla.textContent, /CONTINUATION_PARAGRAPH|AD_BREAK_CONTENT/);

  const readerable = '<!doctype html><title>Continuation</title>' +
    `<div><p class="continue-read-break">${PARAGRAPHS.join(' ')}</p></div>`;
  withDOM(readerable, document => {
    assert.equal(isProbablyReaderable(document, {engine: 'chromium'}), true);
    assert.equal(isProbablyReaderable(document, {engine: 'mozilla'}), false);
  });
});

test('invalid options are rejected and document-size limits propagate', () => {
  const html = articleHTML();
  for (const url of ['relative/path', 'file:///tmp/page.html', 'javascript:alert(1)']) {
    assert.throws(() => extractHTML(html, {url}), /absolute HTTP\(S\)/);
  }
  assert.throws(() => extractHTML(html), /requires options/);
  assert.throws(() => extractHTML(html, {url: SOURCE_URL, engine: 'unknown'}), /engine/);
  assert.throws(() => extractHTML(html, {url: SOURCE_URL, sanitize: 'yes'}), /sanitize/);
  assert.throws(() => extractHTML(html, {url: SOURCE_URL, maxElemsToParse: -1}), /maxElemsToParse/);
  assert.throws(() => extractHTML(html, {url: SOURCE_URL, maxElemsToParse: 2}), /elements/i);
  withDOM(html, document => {
    assert.throws(() => isProbablyReaderable(document, {minScore: Infinity}), /minScore/);
  });
});
