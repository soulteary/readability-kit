// Copyright 2026 The Chromium Authors
// Adapted from chrome/browser/resources/side_panel/read_anything/content/
// readability_content_processing.ts. Original source: BSD-3-Clause; see
// LICENSES/BSD-3-Clause-Chromium.txt. Standalone adaptations: Apache-2.0.

const ANNOUNCEMENTS =
  '[aria-live="polite"], [aria-live="assertive"], [role="alert"], [role="status"], [role="log"]';
const UI_LABELS = new Set([
  'advertisement', 'sponsored', 'supported by', 'skip advertisement',
]);
const INLINE = new Set(['SPAN', 'B', 'I', 'STRONG', 'EM']);
const EMPTY_WRAPPERS = new Set([
  'DIV', 'P', 'SECTION', 'ASIDE', 'HEADER', 'FOOTER', 'ARTICLE', 'MAIN',
  'NAV', 'FIGURE', 'FIGCAPTION', 'UL', 'OL', 'LI', ...INLINE,
]);
const MEDIA = 'img, canvas, picture, video, audio, iframe, svg, math';

/**
 * Keep the content-only subset of Chromium's postprocessing. Layout visibility
 * is deliberately not inferred from bounding boxes in detached/static DOMs.
 */
export function cleanContent(container: HTMLElement): void {
  for (const element of Array.from(container.querySelectorAll('*'))) {
    if (!container.contains(element)) continue;
    const rawText = element.textContent ?? '';
    const text = rawText.trim();
    const hasMedia = element.matches(MEDIA) || element.querySelector(MEDIA) !== null;

    if (!hasMedia && element.matches(ANNOUNCEMENTS) && text.length < 200) {
      element.remove();
      continue;
    }

    // Exact labels avoid deleting a paragraph merely discussing sponsorship.
    if (!hasMedia && UI_LABELS.has(text.toLowerCase())) {
      element.remove();
      continue;
    }

    if (!EMPTY_WRAPPERS.has(element.tagName) || text.length > 0 || hasMedia) {
      continue;
    }
    const separatesWords = INLINE.has(element.tagName) && rawText.length > 0 &&
      Boolean(element.previousSibling?.textContent?.trim()) &&
      Boolean(element.nextSibling?.textContent?.trim());
    if (separatesWords) element.replaceWith(' ');
    else element.remove();
  }
}
