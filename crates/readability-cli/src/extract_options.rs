// SPDX-License-Identifier: Apache-2.0
//! The untyped JS boundary is separate from Rust's typed library API.
use readability_core::{Engine, ExtractOptions};
use serde_json::{Map, Value};
use url::Url;
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn number(v: &Value) -> Option<f64> {
    match v {
        Value::Null => Some(0.0),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::Number(n) => n.as_f64(),
        Value::String(s) => {
            if s.trim().is_empty() {
                Some(0.0)
            } else {
                s.trim().parse().ok()
            }
        }
        _ => None,
    }
}
fn boolean(o: &Map<String, Value>, name: &str, default: bool) -> Result<bool, String> {
    o.get(name).map_or(Ok(default), |v| {
        v.as_bool()
            .ok_or_else(|| format!("{name} must be a boolean."))
    })
}
fn numeric(
    o: &Map<String, Value>,
    name: &str,
    min: Option<f64>,
    integer: bool,
    default: f64,
) -> Result<f64, String> {
    let Some(v) = o.get(name) else {
        return Ok(default);
    };
    v.as_f64()
        .filter(|f| f.is_finite() && (!integer || f.fract() == 0.0) && min.is_none_or(|m| *f >= m))
        .ok_or_else(|| {
            format!(
                "{name} must be a finite {}{}.",
                if integer { "integer" } else { "number" },
                min.map_or(String::new(), |m| format!(" greater than or equal to {m}"))
            )
        })
}
pub fn decode(v: &Value, public: bool) -> Result<ExtractOptions, String> {
    let obj = v.as_object().ok_or("options must be an object.")?;
    let mut o = ExtractOptions {
        url: Some(
            obj.get("url")
                .and_then(Value::as_str)
                .ok_or("url must be an absolute HTTP(S) URL.")?
                .into(),
        ),
        ..ExtractOptions::default()
    };
    let source = Url::parse(o.url.as_deref().unwrap())
        .map_err(|_| "url must be an absolute HTTP(S) URL.")?;
    if public && (!matches!(source.scheme(), "http" | "https") || source.host_str().is_none()) {
        return Err("url must be an absolute HTTP(S) URL.".into());
    }
    o.engine = match obj.get("engine") {
        None | Some(Value::Null) => Engine::Chromium,
        Some(Value::String(s)) if s == "chromium" => Engine::Chromium,
        Some(Value::String(s)) if s == "mozilla" => Engine::Mozilla,
        _ => return Err("engine must be \"chromium\" or \"mozilla\".".into()),
    };
    if public {
        o.flatten_shadow_roots = boolean(obj, "flattenShadowRoots", true)?;
        o.char_threshold = numeric(obj, "charThreshold", Some(1.0), true, 500.0)? as usize;
        o.max_elems_to_parse = numeric(obj, "maxElemsToParse", Some(0.0), true, 0.0)? as usize;
        o.nb_top_candidates = numeric(obj, "nbTopCandidates", Some(1.0), true, 5.0)? as usize;
        o.link_density_modifier = numeric(obj, "linkDensityModifier", None, false, 0.0)? as f32;
        o.keep_classes = boolean(obj, "keepClasses", false)?;
        o.disable_json_ld = boolean(obj, "disableJSONLD", false)?;
        o.sanitize = boolean(obj, "sanitize", true)?;
        if let Some(v) = obj.get("classesToPreserve") {
            o.classes_to_preserve = v
                .as_array()
                .filter(|a| a.iter().all(Value::is_string))
                .ok_or("classesToPreserve must be an array of strings.")?
                .iter()
                .map(|s| s.as_str().unwrap().to_string())
                .collect();
        }
    } else {
        for (key, field) in [
            ("charThreshold", &mut o.char_threshold),
            ("maxElemsToParse", &mut o.max_elems_to_parse),
            ("nbTopCandidates", &mut o.nb_top_candidates),
        ] {
            if let Some(v) = obj.get(key).filter(|v| truthy(v)) {
                if let Some(f) = number(v).filter(|f| f.is_finite()) {
                    *field = if key == "maxElemsToParse" {
                        f.floor()
                    } else {
                        f.ceil()
                    } as usize;
                }
            }
        }
        o.keep_classes = obj.get("keepClasses").is_some_and(truthy);
        o.disable_json_ld = obj.get("disableJSONLD").is_some_and(truthy);
        if let Some(f) = obj.get("linkDensityModifier").and_then(number) {
            o.link_density_modifier = f as f32;
        }
        if let Some(v) = obj.get("classesToPreserve") {
            match v {
                Value::Array(a) => {
                    o.classes_to_preserve = a
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                }
                Value::String(s) => o.classes_to_preserve = vec![s.clone()],
                _ => {}
            }
        }
    }
    Ok(o)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn public_validation_and_raw_coercion() {
        let v = json!({"url":"file:///tmp/page.html","sanitize":"false","charThreshold":1.5});
        assert!(decode(&v, true).is_err());
        let raw = decode(&v, false).unwrap();
        assert_eq!(raw.char_threshold, 2);
        assert!(raw.sanitize);
        assert_eq!(
            decode(&json!({"url":"https://example.com","sanitize":null}), true).unwrap_err(),
            "sanitize must be a boolean."
        );
        assert!(decode(
            &json!({"url":"https://example.com","engine":null,"unknown":true}),
            true
        )
        .is_ok());
    }
}
