// SPDX-License-Identifier: Apache-2.0
//! Machine protocol for the JS/Rust compatibility harness; not the public CLI.
use crate::{extract_html, extract_raw_html, is_probably_readerable, Engine, ReaderableOptions};
#[path = "boundary_extract_options.rs"]
mod extract_options;
pub use extract_options::decode as decode_extract_options;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    html: String,
    #[serde(default = "default_options")]
    options: Value,
    #[serde(default = "api_layer")]
    layer: String,
}
fn default_options() -> Value {
    json!({})
}
fn api_layer() -> String {
    "api".into()
}
// Match the public JS validation order and diagnostics before converting JSON numbers
// into the narrower native heuristic types. Unknown fields are ignored by JS.
pub fn readerable_options(value: &Value) -> Result<ReaderableOptions, &'static str> {
    let object = value.as_object().ok_or("options must be an object.")?;
    let engine = match object.get("engine") {
        None | Some(Value::Null) => Engine::Chromium,
        Some(Value::String(value)) if value == "chromium" => Engine::Chromium,
        Some(Value::String(value)) if value == "mozilla" => Engine::Mozilla,
        _ => return Err("engine must be \"chromium\" or \"mozilla\"."),
    };
    let mut options = ReaderableOptions {
        engine,
        ..Default::default()
    };
    if let Some(value) = object.get("flattenShadowRoots") {
        options.flatten_shadow_roots = value
            .as_bool()
            .ok_or("flattenShadowRoots must be a boolean.")?;
    }
    if let Some(value) = object.get("minContentLength") {
        let number = value
            .as_f64()
            .filter(|n| n.is_finite() && *n >= 0.0 && n.fract() == 0.0)
            .ok_or("minContentLength must be a finite integer greater than or equal to 0.")?;
        options.min_content_length = number as usize;
    }
    if let Some(value) = object.get("minScore") {
        let number = value
            .as_f64()
            .filter(|n| n.is_finite() && *n >= 0.0)
            .ok_or("minScore must be a finite number greater than or equal to 0.")?;
        options.min_score = number.min(f32::MAX as f64) as f32;
    }
    Ok(options)
}
pub fn process(input: &str) -> Value {
    let request: Request = match serde_json::from_str(input) {
        Ok(request) => request,
        Err(error) => return json!({"status":"error", "article":null, "error":error.to_string()}),
    };
    if request.layer == "readerable" {
        let options: ReaderableOptions = match readerable_options(&request.options) {
            Ok(options) => options,
            Err(error) => {
                return json!({"status":"error", "article":null, "error":error.to_string()})
            }
        };
        return match is_probably_readerable(&request.html, &options) {
            Ok(article) => json!({"status":"ok", "article":article}),
            Err(error) => json!({"status":"error", "article":null, "error":error.to_string()}),
        };
    }
    let options = match extract_options::decode(&request.options, request.layer == "api") {
        Ok(options) => options,
        Err(error) => return json!({"status":"error", "article":null, "error":error.to_string()}),
    };
    let result = match request.layer.as_str() {
        "api" => extract_html(&request.html, &options),
        "raw" | "engine" => extract_raw_html(&request.html, &options),
        _ => {
            return json!({"status":"error", "article":null, "error":"layer must be api, raw, engine, or readerable"})
        }
    };
    match result {
        Ok(Some(article)) => {
            let mut article =
                serde_json::to_value(article).expect("Article serialization is infallible");
            if request.layer != "api" {
                let object = article.as_object_mut().expect("Article is an object");
                object.remove("url");
                object.remove("engine");
                if object.get("excerpt") == Some(&Value::Null) {
                    object.remove("excerpt");
                }
            }
            json!({"status":"ok", "article":article})
        }
        Ok(None) => json!({"status":"empty", "article":null}),
        Err(error) => json!({"status":"error", "article":null, "error":error.to_string()}),
    }
}
