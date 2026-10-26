import createDOMPurify from 'dompurify';
import ChromiumReadability from '../vendor/chromium/Readability.js';
import chromiumReaderable from '../vendor/chromium/Readability-readerable.js';
import MozillaReadability from '../vendor/mozilla/Readability.js';
import mozillaReaderable from '../vendor/mozilla/Readability-readerable.js';
import {cloneDocument} from './clone.js';
import {cleanContent} from './cleanup.js';
import {
  assertDocument, validateExtractOptions, validateReaderableOptions, validateURL,
} from './validation.js';
import type {Article, ExtractOptions, ReaderableOptions} from './types.js';

export type {Article, Engine, ExtractOptions, ReaderableOptions} from './types.js';

function applySourceURL(document: Document, sourceURL: string): void {
  // Interpret the source page's base relative to its supplied address. Do not
  // insert <base>: DOMParser/cloned documents can inherit a reader app's CSP,
  // whose base-uri policy correctly prevents changing browser URL resolution.
  const base = document.querySelector('base[href]');
  let baseURL = sourceURL;
  if (base) {
    try {
      const resolved = new URL(base.getAttribute('href') ?? '', sourceURL);
      // Keep the same HTTP(S) boundary as the explicit source URL. In
      // particular, HTML itself ignores javascript: and data: base URLs.
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        baseURL = resolved.href;
      }
    } catch {
      // An invalid page-provided base falls back to the known source URL.
    }
  }

  // Readability reads these JavaScript properties when rewriting links, media,
  // and srcset after lazy-image handling. Set extraction metadata only on our
  // fresh inert clone; this does not change the browser's internal document URL,
  // navigation context, or CSP. The caller's DOM and DOM prototypes stay intact.
  Object.defineProperties(document, {
    baseURI: {value: baseURL, configurable: true, enumerable: true},
    documentURI: {value: sourceURL, configurable: true, enumerable: true},
    URL: {value: sourceURL, configurable: true, enumerable: true},
  });

  // Chromium reads a candidate lead image's native .src before its normal URL
  // rewrite. That getter uses the internal browser base, so resolve the raw
  // attribute first. Leave lazy attributes/srcset to upstream's own parser.
  for (const image of Array.from(document.querySelectorAll('img[src]'))) {
    const src = image.getAttribute('src');
    if (!src) continue;
    try {
      image.setAttribute('src', new URL(src, baseURL).href);
    } catch {
      // Preserve malformed values for Readability and the sanitizer to handle.
    }
  }
}

function sanitizeHTML(html: string, source: Document): string {
  const windowForDOM = source.defaultView ??
    (typeof window === 'undefined' ? null : window);
  if (!windowForDOM) {
    throw new TypeError(
      'Sanitization needs a DOM window. Use extractHTML in Node, or pass a document from a browser/jsdom window.',
    );
  }
  const purifier = createDOMPurify(
    windowForDOM as unknown as Parameters<typeof createDOMPurify>[0],
  );
  if (!purifier.isSupported) {
    throw new Error('DOMPurify does not support this DOM implementation.');
  }
  return purifier.sanitize(html, {
    RETURN_TRUSTED_TYPE: false,
    // Article output does not need page styling or interactive form controls.
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
    FORBID_ATTR: ['style'],
  });
}

function nullable(value: string | null | undefined): string | null {
  return value == null || value === '' ? null : value;
}

/**
 * Extract an article from a clone of an HTML document. The caller's document is
 * never modified. A null result means Readability did not find article content.
 */
export function extractDocument(
  document: Document, options: ExtractOptions = {},
): Article | null {
  assertDocument(document);
  const engine = validateExtractOptions(options);
  const cloned = cloneDocument(document, options.flattenShadowRoots !== false);
  const sourceURL = options.url === undefined ? document.URL : validateURL(options.url);
  if (options.url !== undefined) applySourceURL(cloned, sourceURL);

  const Readability = engine === 'chromium' ? ChromiumReadability : MozillaReadability;
  const raw = new Readability(cloned, {
    charThreshold: options.charThreshold,
    maxElemsToParse: options.maxElemsToParse,
    nbTopCandidates: options.nbTopCandidates,
    keepClasses: options.keepClasses,
    classesToPreserve: options.classesToPreserve,
    disableJSONLD: options.disableJSONLD,
    linkDensityModifier: options.linkDensityModifier,
  }).parse();
  if (!raw || typeof raw.content !== 'string') return null;

  const content = options.sanitize === false ? raw.content : sanitizeHTML(raw.content, document);
  // A cloned document is inert, including when the caller used sanitize:false.
  const container = cloned.createElement('div');
  container.innerHTML = content;
  cleanContent(container);
  const textContent = container.textContent ?? '';

  return {
    title: raw.title ?? '',
    byline: nullable(raw.byline),
    dir: nullable(raw.dir),
    lang: nullable(raw.lang),
    content: container.innerHTML,
    textContent,
    length: textContent.length,
    excerpt: nullable(raw.excerpt),
    siteName: nullable(raw.siteName),
    publishedTime: nullable(raw.publishedTime),
    url: sourceURL,
    engine,
  };
}

/** A quick heuristic, not a prerequisite for extraction; false negatives occur. */
export function isProbablyReaderable(
  document: Document, options: ReaderableOptions = {},
): boolean {
  assertDocument(document);
  const engine = validateReaderableOptions(options);
  const cloned = cloneDocument(document, options.flattenShadowRoots !== false);
  const readerable = engine === 'chromium' ? chromiumReaderable : mozillaReaderable;
  const heuristicOptions: Record<string, unknown> = {};
  // Upstream merges options with defaults using Object.assign, so undefined
  // values must be omitted instead of overwriting minScore/minContentLength.
  if (options.minContentLength !== undefined) {
    heuristicOptions.minContentLength = options.minContentLength;
  }
  if (options.minScore !== undefined) heuristicOptions.minScore = options.minScore;
  return readerable(cloned, heuristicOptions);
}
