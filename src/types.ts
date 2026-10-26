/** The extraction implementation to use. Both receive the same wrapper steps. */
export type Engine = 'chromium' | 'mozilla';

export interface ExtractOptions {
  /** Defaults to Chromium's modified Mozilla Readability. */
  engine?: Engine;
  /** Absolute HTTP(S) source URL, useful for a document made by DOMParser. */
  url?: string;
  /** Minimum article length considered during candidate selection. Default: 500. */
  charThreshold?: number;
  /** Maximum document element count. Zero means no limit. Default: 0. */
  maxElemsToParse?: number;
  /** Number of top article candidates to consider. Default: 5. */
  nbTopCandidates?: number;
  /** Preserve all element classes. Default: false. */
  keepClasses?: boolean;
  /** Additional class names to preserve when keepClasses is false. */
  classesToPreserve?: string[];
  /** Ignore JSON-LD metadata. Default: false. */
  disableJSONLD?: boolean;
  /** Additive modifier for Readability's link-density threshold. Default: 0. */
  linkDensityModifier?: number;
  /** Include reachable open shadow roots and assigned slots. Default: true. */
  flattenShadowRoots?: boolean;
  /** Sanitize the extracted HTML with DOMPurify. Default: true. */
  sanitize?: boolean;
}

export interface ReaderableOptions {
  engine?: Engine;
  /** Minimum text-node length in the readerability heuristic. Default: 140. */
  minContentLength?: number;
  /** Minimum accumulated readerability score. Default: 20. */
  minScore?: number;
  /** Include reachable open shadow roots and assigned slots. Default: true. */
  flattenShadowRoots?: boolean;
}

/** A detached, serializable extraction result. No DOM objects are retained. */
export interface Article {
  title: string;
  byline: string | null;
  dir: string | null;
  lang: string | null;
  content: string;
  /** Text of the final content after cleanup and optional sanitization. */
  textContent: string;
  /** JavaScript string length of textContent (UTF-16 code units). */
  length: number;
  excerpt: string | null;
  siteName: string | null;
  publishedTime: string | null;
  /** Source URL; an existing document's URL can be non-HTTP(S). */
  url: string;
  engine: Engine;
}
