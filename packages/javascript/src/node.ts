import {JSDOM, VirtualConsole} from 'jsdom';
import {extractDocument} from './index.js';
import type {Article, ExtractOptions} from '../../shared/src/types.js';
import {validateURL} from '../../shared/src/validation.js';

export * from './index.js';

export interface HTMLExtractOptions extends ExtractOptions {
  /** Absolute HTTP(S) URL of the source HTML, used to resolve relative links. */
  url: string;
}

/** Parse inert HTML without fetching resources or executing page scripts. */
export function extractHTML(html: string, options: HTMLExtractOptions): Article | null {
  if (typeof html !== 'string') throw new TypeError('html must be a string.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('extractHTML requires options with an absolute HTTP(S) url.');
  }
  const url = validateURL(options.url);
  // Do not enable runScripts or resources: extraction never loads the page.
  // CSS diagnostics from arbitrary pages are irrelevant to extraction and
  // should not write to a library consumer's console or a CLI's stderr.
  const dom = new JSDOM(html, {url, virtualConsole: new VirtualConsole()});
  try {
    return extractDocument(dom.window.document, {...options, url});
  } finally {
    dom.window.close();
  }
}
