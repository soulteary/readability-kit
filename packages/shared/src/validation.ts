import type {Engine, ExtractOptions, ReaderableOptions} from './types.js';

export function assertDocument(document: Document): void {
  if (!document || document.nodeType !== 9 ||
      typeof document.createElement !== 'function' || !document.documentElement) {
    throw new TypeError('Expected an HTML Document with a document element.');
  }
}

export function validateURL(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError('url must be an absolute HTTP(S) URL.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('url must be an absolute HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('url must be an absolute HTTP(S) URL.');
  }
  return url.href;
}

function numberOption(
  name: string, value: number | undefined, min?: number, integer = false,
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) || (min !== undefined && value < min)) {
    throw new TypeError(`${name} must be a finite ${integer ? 'integer' : 'number'}` +
      (min === undefined ? '.' : ` greater than or equal to ${min}.`));
  }
}

function booleanOption(name: string, value: boolean | undefined): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean.`);
  }
}

function validateCommon(options: ExtractOptions | ReaderableOptions): Engine {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object.');
  }
  const engine = options.engine ?? 'chromium';
  if (engine !== 'chromium' && engine !== 'mozilla') {
    throw new TypeError('engine must be "chromium" or "mozilla".');
  }
  booleanOption('flattenShadowRoots', options.flattenShadowRoots);
  return engine;
}

export function validateExtractOptions(options: ExtractOptions): Engine {
  const engine = validateCommon(options);
  if (options.url !== undefined) validateURL(options.url);
  numberOption('charThreshold', options.charThreshold, 1, true);
  numberOption('maxElemsToParse', options.maxElemsToParse, 0, true);
  numberOption('nbTopCandidates', options.nbTopCandidates, 1, true);
  numberOption('linkDensityModifier', options.linkDensityModifier);
  booleanOption('keepClasses', options.keepClasses);
  booleanOption('disableJSONLD', options.disableJSONLD);
  booleanOption('sanitize', options.sanitize);
  if (options.classesToPreserve !== undefined &&
      (!Array.isArray(options.classesToPreserve) ||
       options.classesToPreserve.some(value => typeof value !== 'string'))) {
    throw new TypeError('classesToPreserve must be an array of strings.');
  }
  return engine;
}

export function validateReaderableOptions(options: ReaderableOptions): Engine {
  const engine = validateCommon(options);
  numberOption('minContentLength', options.minContentLength, 0, true);
  numberOption('minScore', options.minScore, 0);
  return engine;
}
