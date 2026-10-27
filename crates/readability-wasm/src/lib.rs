// SPDX-License-Identifier: Apache-2.0
use wasm_bindgen::prelude::*;

/// Pass HTML separately: no JSON escaping/parsing or intermediate Value tree
/// for the large input. Serialize Article directly, without a Value envelope.
#[wasm_bindgen]
pub fn extract_json(html: &str, options: &str) -> Result<String, JsValue> {
    extract(html, options, true)
}

/// Internal raw-engine adapter for the locked comparison corpus.
#[wasm_bindgen]
pub fn extract_raw_json(html: &str, options: &str) -> Result<String, JsValue> {
    extract(html, options, false)
}
fn extract(html: &str, options: &str, public: bool) -> Result<String, JsValue> {
    let value = serde_json::from_str(options).map_err(js_error)?;
    let options =
        readability_core::boundary::decode_extract_options(&value, public).map_err(js_error)?;
    let article = if public {
        readability_core::extract_html(html, &options)
    } else {
        readability_core::extract_raw_html(html, &options)
    }
    .map_err(js_error)?;
    serde_json::to_string(&article).map_err(js_error)
}

#[wasm_bindgen]
pub fn readerable(html: &str, options: &str) -> Result<bool, JsValue> {
    let value = serde_json::from_str(options).map_err(js_error)?;
    let options = readability_core::boundary::readerable_options(&value).map_err(js_error)?;
    readability_core::is_probably_readerable(html, &options).map_err(js_error)
}
fn js_error(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}
