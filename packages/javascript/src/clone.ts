// Copyright 2025 The Chromium Authors
// Adapted from components/dom_distiller/core/javascript/readability_distiller.js.
// Use of the original source is governed by the BSD-3-Clause license in
// LICENSES/BSD-3-Clause-Chromium.txt. Standalone adaptations are Apache-2.0.

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function isHTMLElement(node: Node, localName: string): node is HTMLElement {
  return node.nodeType === 1 &&
    (node as Element).namespaceURI === HTML_NAMESPACE &&
    (node as Element).localName === localName;
}

function openShadowRoot(node: Node): ShadowRoot | null {
  return node.nodeType === 1 ? (node as Element).shadowRoot : null;
}

function hasOpenShadowRoots(document: Document): boolean {
  // The numeric SHOW_ELEMENT constant avoids depending on the caller's realm.
  const walker = document.createTreeWalker(document, 1);
  while (walker.nextNode()) {
    if (openShadowRoot(walker.currentNode)) return true;
  }
  return false;
}

function cloneFlattenedTree(node: Node, target: Document): Node {
  // Template content belongs to a separate fragment, not its childNodes.
  if (isHTMLElement(node, 'template') && 'content' in node) {
    return target.importNode(node, true);
  }

  // Check the HTML namespace and interface shape rather than host globals:
  // a document can belong to a different iframe or jsdom window.
  if (isHTMLElement(node, 'slot') &&
      typeof (node as HTMLSlotElement).assignedNodes === 'function') {
    const assigned = (node as HTMLSlotElement).assignedNodes({flatten: true});
    if (assigned.length > 0) {
      const fragment = target.createDocumentFragment();
      for (const child of assigned) {
        fragment.appendChild(cloneFlattenedTree(child, target));
      }
      return fragment;
    }
  }

  const clone = target.importNode(node, false);
  const children = openShadowRoot(node)?.childNodes ?? node.childNodes;
  for (const child of Array.from(children)) {
    clone.appendChild(cloneFlattenedTree(child, target));
  }
  return clone;
}

/** Clone a document without changing the caller's DOM or attaching new nodes. */
export function cloneDocument(document: Document, flatten = true): Document {
  if (!flatten || !hasOpenShadowRoots(document)) {
    return document.cloneNode(true) as Document;
  }

  const cloned = document.cloneNode(false) as Document;
  for (const child of Array.from(document.childNodes)) {
    cloned.appendChild(cloneFlattenedTree(child, cloned));
  }
  return cloned;
}
