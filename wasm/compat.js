// SPDX-License-Identifier: Apache-2.0
// Appended to the generated bindings before minification. Test transport only:
// keep the legacy envelope without retaining Rust's generic JSON request/value
// serializer in the production WASM. Application code uses the public facade.
export function request_json(input) {
  try {
    const request = JSON.parse(input);
    const options = JSON.stringify(Object.hasOwn(request, 'options') ? request.options : {});
    const layer = request.layer ?? 'api';
    let article;
    if (layer === 'readerable') article = readerable(request.html, options);
    else if (layer === 'api') article = JSON.parse(extract_json(request.html, options));
    else if (layer === 'raw' || layer === 'engine') {
      article = JSON.parse(extract_raw_json(request.html, options));
      if (article !== null) {
        delete article.url;
        delete article.engine;
        if (article.excerpt === null) delete article.excerpt;
      }
    } else throw new Error('layer must be api, raw, engine, or readerable');
    return JSON.stringify({status: article === null ? 'empty' : 'ok', article});
  } catch (error) {
    return JSON.stringify({status: 'error', article: null, error: error instanceof Error ? error.message : String(error)});
  }
}
