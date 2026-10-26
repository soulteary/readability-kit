declare module '*Readability.js' {
  interface RawArticle {
    title?: string | null;
    byline?: string | null;
    dir?: string | null;
    lang?: string | null;
    content?: string | null;
    textContent?: string | null;
    length?: number | null;
    excerpt?: string | null;
    siteName?: string | null;
    publishedTime?: string | null;
  }

  export default class Readability {
    constructor(document: Document, options?: Record<string, unknown>);
    parse(): RawArticle | null;
  }
}

declare module '*Readability-readerable.js' {
  export default function isProbablyReaderable(
    document: Document,
    options?: Record<string, unknown>,
  ): boolean;
}
