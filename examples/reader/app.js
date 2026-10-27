// SPDX-License-Identifier: Apache-2.0

import { extractDocument } from '../../packages/javascript/dist/index.js';

const sampleURL = 'https://example.com/stories/quiet-reading';
const sampleHTML = `<!doctype html>
<html lang="en">
<head>
  <title>Making room for a quieter kind of reading — Field Notes</title>
  <meta name="author" content="Alex Morgan">
  <meta name="description" content="A small experiment in keeping the useful parts of a page.">
  <meta property="og:site_name" content="Field Notes">
</head>
<body>
  <header><nav><a href="/">Home</a> · <a href="/topics">Topics</a> · Subscribe</nav></header>
  <main>
    <article>
      <h1>Making room for a quieter kind of reading</h1>
      <p class="byline">By Alex Morgan</p>
      <p>On a quiet morning, a saved article can feel like a letter from an earlier version of yourself. You put it aside because something in it seemed worth understanding. When you return, the useful part is still there: a careful observation, an argument you want to test, or a small instruction that makes the next piece of work easier.</p>
      <p>A web page carries much more than that article. It has navigation, recommendations, buttons, and the ordinary machinery that makes a website work. Those elements each have a purpose in their original setting. A reading view gives the article another setting, with room for its paragraphs, headings, references, and the details that connect them.</p>
      <h2>Keep the structure that carries meaning</h2>
      <p>Good extraction needs to preserve relationships. A heading introduces the section that follows it. A quotation belongs with its attribution. A numbered list describes an order, and a table lets the reader compare values without holding every number in memory. Flattening all of those elements into a single block of text loses part of the author's explanation.</p>
      <blockquote><p>A useful reading view keeps enough structure for the reader to follow the thinking.</p></blockquote>
      <p>That is why a small experiment should include more than one tidy paragraph. Try an article with a long title, relative links, code, or a table. Compare the extracted text with the original source. Look for the section that disappeared, the caption that moved, or the unrelated recommendation that arrived with the article.</p>
      <table><thead><tr><th>Element</th><th>What it contributes</th></tr></thead><tbody><tr><td>Headings</td><td>A route through the article</td></tr><tr><td>Lists</td><td>Sequence and comparison</td></tr><tr><td>Links</td><td>A way back to the source</td></tr></tbody></table>
      <h2>A small, repeatable workflow</h2>
      <p>Start with a saved HTML page and its real address. The address helps resolve relative links, so a reference such as <code>../notes</code> still points to the right place. Run the same source through the extractor, inspect the output, and keep a regression example when you fix a problem. A collection of well-chosen examples makes changes easier to judge.</p>
      <pre><code>const article = extractDocument(document, {
  url: 'https://example.com/stories/quiet-reading',
  engine: 'chromium',
});</code></pre>
      <p>Sometimes the page is mostly an application, a login screen, or a collection of small cards. An extractor may find no article in that material. Returning an empty result is useful information: it lets the caller choose a different input or present the original page instead of pretending the extraction worked.</p>
      <p>For this experiment, switch engines and inspect the HTML or JSON alongside the reading view. The sample is intentionally simple. Your own examples will reveal the details that matter for the pages you read and the tools you build. Keep those examples small enough to understand, and specific enough to explain a real result.</p>
      <p><a href="../notes">Browse the accompanying field notes</a></p>
    </article>
    <aside><h2>You might also like</h2><a href="/offers">This week's offers</a></aside>
  </main>
  <footer>Privacy · Terms · Contact</footer>
</body>
</html>`;

const form = document.querySelector('#extract-form');
const sourceURL = document.querySelector('#source-url');
const sourceHTML = document.querySelector('#source-html');
const engineSelect = document.querySelector('#engine');
const status = document.querySelector('#status');
const inputSize = document.querySelector('#input-size');
const copyButton = document.querySelector('#copy-button');
const result = document.querySelector('#result');
const emptyState = document.querySelector('#empty-state');
const engineBadge = document.querySelector('#engine-badge');
const metadata = document.querySelector('#metadata');
const readerFrame = document.querySelector('#reader-frame');
const htmlOutput = document.querySelector('#html-output');
const jsonOutput = document.querySelector('#json-output');
const tabs = [...document.querySelectorAll('[role="tab"]')];
let currentArticle = null;

const readerStyles = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 36px clamp(24px, 7vw, 55px) 45px; background: #fffefa; color: #333c3a; font: 17px/1.85 Georgia, 'Times New Roman', serif; overflow-wrap: anywhere; }
  h1 { font-size: clamp(28px, 5vw, 38px); line-height: 1.18; font-weight: 400; letter-spacing: -.035em; margin: 0 0 28px; color: #24302d; }
  h2, h3 { font-size: 24px; line-height: 1.35; font-weight: 400; letter-spacing: -.025em; margin: 34px 0 15px; }
  p { margin: 0 0 21px; }
  a { color: #236b5a; text-decoration-thickness: 1px; text-underline-offset: 3px; }
  blockquote { margin: 28px 0; padding: 1px 0 1px 22px; border-left: 2px solid #b7ccbe; color: #5a6d60; font-style: italic; }
  blockquote p { margin: 9px 0; }
  pre { white-space: pre-wrap; background: #f1f3ed; padding: 17px; border-radius: 5px; overflow: auto; }
  code { font: 12px/1.8 ui-monospace, SFMono-Regular, Consolas, monospace; background: #f1f3ed; }
  table { width: 100%; border-collapse: collapse; margin: 26px 0; font: 13px/1.7 system-ui, sans-serif; }
  th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e1e4d9; }
  th { font-weight: 600; background: #f4f5ee; }
  img, video, svg { max-width: 100%; height: auto; }
  img { font: 12px/1.5 system-ui, sans-serif; }
  figure { margin: 25px 0; } figcaption { font: 12px/1.6 system-ui, sans-serif; color: #7f877e; }
  ul, ol { padding-left: 25px; } li { padding-left: 3px; margin: 7px 0; }
`;

function setStatus(message, state = '') {
  status.textContent = message;
  status.className = `status ${state}`;
}

function updateInputSize() {
  inputSize.textContent = `${sourceHTML.value.length.toLocaleString()} characters`;
}

function selectTab(selected, focus = false) {
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle('active', active);
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (focus) selected.focus();
}

function clearResult() {
  currentArticle = null;
  result.hidden = true;
  emptyState.hidden = false;
  engineBadge.hidden = true;
  copyButton.disabled = true;
  readerFrame.srcdoc = '';
  htmlOutput.textContent = '';
  jsonOutput.textContent = '';
  metadata.replaceChildren();
}

function loadSample() {
  sourceURL.value = sampleURL;
  sourceHTML.value = sampleHTML;
  updateInputSize();
  clearResult();
  setStatus('The sample is ready to extract.');
}

function addMetadata(label, value) {
  if (!value) return;
  const item = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = label;
  item.append(name, document.createTextNode(String(value)));
  metadata.append(item);
}

function renderArticle(article) {
  currentArticle = article;
  metadata.replaceChildren();
  addMetadata('Author', article.byline);
  addMetadata('Site', article.siteName);
  addMetadata('Language', article.lang);
  addMetadata('Published', article.publishedTime);
  addMetadata('Length', `${article.length.toLocaleString()} characters`);
  engineBadge.textContent = article.engine === 'chromium' ? 'Chromium' : 'Mozilla';
  engineBadge.hidden = false;

  // The API has already sanitized article.content. A separate sandboxed
  // document also isolates article presentation and blocks remote media.
  const preview = document.implementation.createHTMLDocument(article.title);
  const policy = preview.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'";
  preview.head.prepend(policy);
  const style = preview.createElement('style');
  style.textContent = readerStyles;
  preview.head.append(style);
  preview.documentElement.lang = article.lang || 'en';
  if (article.dir === 'rtl' || article.dir === 'ltr') preview.documentElement.dir = article.dir;
  const heading = preview.createElement('h1');
  heading.textContent = article.title || 'Untitled article';
  const body = preview.createElement('article');
  body.innerHTML = article.content;
  // Keep external navigation out of this isolated preview. The HTML and JSON
  // views preserve the original extracted links for reuse.
  for (const link of body.querySelectorAll('a, area')) {
    const target = link.getAttribute('href')
      || link.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (target) link.setAttribute('title', target);
    link.removeAttribute('href');
    link.removeAttribute('xlink:href');
    link.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
  }
  preview.body.append(heading, body);
  readerFrame.srcdoc = `<!doctype html>${preview.documentElement.outerHTML}`;
  htmlOutput.textContent = article.content;
  jsonOutput.textContent = JSON.stringify(article, null, 2);
  result.hidden = false;
  emptyState.hidden = true;
  copyButton.disabled = false;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!sourceHTML.value.trim()) {
    clearResult();
    setStatus('Paste some HTML or load the sample first.', 'error');
    sourceHTML.focus();
    return;
  }
  try {
    const url = new URL(sourceURL.value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Use an absolute http:// or https:// page address.');
    }
    const started = performance.now();
    const source = new DOMParser().parseFromString(sourceHTML.value, 'text/html');
    const article = extractDocument(source, { url: url.href, engine: engineSelect.value });
    if (!article) {
      clearResult();
      setStatus('No article was found. Try a page with a longer, continuous body of text.', 'error');
      return;
    }
    renderArticle(article);
    setStatus(`Extracted ${article.length.toLocaleString()} characters in ${Math.round(performance.now() - started)} ms.`, 'success');
  } catch (error) {
    clearResult();
    setStatus(error instanceof Error ? error.message : 'The article could not be extracted.', 'error');
  }
});

sourceHTML.addEventListener('input', updateInputSize);
document.querySelector('#sample-button').addEventListener('click', loadSample);
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    let destination = index;
    if (event.key === 'ArrowRight') destination = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') destination = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') destination = 0;
    else if (event.key === 'End') destination = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[destination], true);
  });
});

copyButton.addEventListener('click', async () => {
  if (!currentArticle) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentArticle, null, 2));
    setStatus('Article JSON copied to the clipboard.', 'success');
  } catch {
    selectTab(document.querySelector('#tab-json'));
    setStatus('Clipboard access is unavailable. Select and copy the JSON result.', 'error');
  }
});

loadSample();
