// SPDX-License-Identifier: Apache-2.0
import initialize, {extract_json, readerable} from './pkg/readability_wasm.js';
import {validateExtractOptions, validateReaderableOptions, validateURL} from '../src/validation.js';
import type {Article, ExtractOptions, ReaderableOptions} from '../src/types.js';
export type {Article, Engine, ExtractOptions, ReaderableOptions} from '../src/types.js';
export interface HTMLExtractOptions extends ExtractOptions { url: string }
export type WasmInput = string | URL | Response | BufferSource | WebAssembly.Module;
let ready = false;
let pending: Promise<void> | undefined;
/** Initialize once per JS realm. Concurrent callers share the first input. Failed loads may be retried. */
export function init(input?: WasmInput): Promise<void> {
  if (!pending) pending = initialize(input === undefined ? undefined : {module_or_path: input})
    .then(() => { ready = true; })
    .catch(error => { pending = undefined; throw error; });
  return pending;
}
function invoke(html: string, options: object, layer: string): Article | boolean | null {
  if (!ready) throw new Error('Call and await init() before extraction.');
  try {
    const encoded = JSON.stringify(options);
    return layer === 'readerable' ? readerable(html, encoded) : JSON.parse(extract_json(html, encoded));
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
const extractKeys = ['engine', 'url', 'charThreshold', 'maxElemsToParse', 'nbTopCandidates', 'keepClasses', 'classesToPreserve', 'disableJSONLD', 'linkDensityModifier', 'flattenShadowRoots', 'sanitize'];
const readerableKeys = ['engine', 'minContentLength', 'minScore', 'flattenShadowRoots'];
// Ignore unknown keys before JSON/structured-clone, as the existing API does.
function selectOptions(options: object, keys: string[]): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of keys) if (key in options) selected[key] = (options as Record<string, unknown>)[key];
  return selected;
}
function prepareExtract(html: string, options: HTMLExtractOptions): HTMLExtractOptions {
  if (typeof html !== 'string') throw new TypeError('html must be a string.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('extractHTML requires options with an absolute HTTP(S) url.');
  }
  const url = validateURL(options.url);
  validateExtractOptions(options);
  return {...selectOptions(options, extractKeys), url};
}
function prepareReaderable(html: string, options: ReaderableOptions): ReaderableOptions {
  if (typeof html !== 'string') throw new TypeError('html must be a string.');
  validateReaderableOptions(options);
  return selectOptions(options, readerableKeys);
}
export function extractHTML(html: string, options: HTMLExtractOptions): Article | null {
  return invoke(html, prepareExtract(html, options), 'api') as Article | null;
}
/** String-input counterpart to the existing document-based readerability API. */
export function isProbablyReaderable(html: string, options: ReaderableOptions = {}): boolean {
  return invoke(html, prepareReaderable(html, options), 'readerable') as boolean;
}
export interface WorkerReader {
  extractHTML(html: string, options: HTMLExtractOptions): Promise<Article | null>;
  isProbablyReaderable(html: string, options?: ReaderableOptions): Promise<boolean>;
  terminate(): void;
}
export interface WorkerOptions {
  workerURL?: string | URL;
  wasmURL?: string | URL;
  /** Timeout for initialization and each request, including queue time. Default: 30000 ms. */
  timeoutMs?: number;
}
/** Owns one module Worker. Timeout, load failure, or terminate rejects every pending request. */
export async function createWorkerReader(options: WorkerOptions = {}): Promise<WorkerReader> {
  const timeout = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError('timeoutMs must be positive and finite.');
  const worker = new Worker(options.workerURL ?? new URL('./worker.js', import.meta.url), {type: 'module'});
  let nextID = 0;
  let closed: Error | undefined;
  const requests = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();
  function close(error: Error) {
    if (closed) return;
    closed = error;
    worker.terminate();
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(error); }
    requests.clear();
  }
  worker.onerror = event => { event.preventDefault(); close(new Error(event.message || 'WASM Worker failed.')); };
  worker.onmessageerror = () => close(new Error('Unable to decode WASM Worker response.'));
  worker.onmessage = ({data}) => {
    const request = requests.get(data.id);
    if (!request) return;
    requests.delete(data.id);
    clearTimeout(request.timer);
    if (data.error) {
      const error = data.error.name === 'TypeError' ? new TypeError(data.error.message) : new Error(data.error.message);
      request.reject(error);
    } else request.resolve(data.value);
  };
  function call(method: string, args: unknown[]): Promise<any> {
    if (closed) return Promise.reject(closed);
    const id = ++nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => close(new Error('WASM Worker request timed out.')), timeout);
      requests.set(id, {resolve, reject, timer});
      try { worker.postMessage({id, method, args}); }
      catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
    });
  }
  try { await call('init', [options.wasmURL === undefined ? undefined : new URL(options.wasmURL, import.meta.url).href]); }
  catch (error) { close(error as Error); throw error; }
  return {
    extractHTML: async (html, opts) => call('extractHTML', [html, prepareExtract(html, opts)]),
    isProbablyReaderable: async (html, opts = {}) => call('isProbablyReaderable', [html, prepareReaderable(html, opts)]),
    terminate: () => close(new Error('WASM Worker was terminated.')),
  };
}
