// SPDX-License-Identifier: Apache-2.0
//! Resident full-pipeline benchmark protocol, intentionally separate from the CLI.
use readability_core::{extract_html, ExtractOptions};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{self, Read},
    time::Instant,
};
#[derive(Deserialize)]
struct Case {
    id: String,
    html: String,
    #[serde(default)]
    options: ExtractOptions,
}
#[derive(Deserialize)]
struct Request {
    cases: Vec<Case>,
    #[serde(default)]
    warmup: usize,
    iterations: usize,
    #[serde(default = "default_serialize")]
    serialize: bool,
    #[serde(default, rename = "allowEmpty")]
    allow_empty: bool,
}
fn default_serialize() -> bool {
    true
}
fn measure_case(
    case: Case,
    warmup: usize,
    iterations: usize,
    serialize: bool,
    allow_empty: bool,
) -> Result<Value, Box<dyn std::error::Error>> {
    for _ in 0..warmup {
        let article = extract_html(&case.html, &case.options)?;
        if !allow_empty && article.as_ref().is_none_or(|a| a.text_content.is_empty()) {
            return Err(format!("{}: extraction returned empty text", case.id).into());
        }
        if serialize {
            std::hint::black_box(serde_json::to_vec(&article)?);
        }
        std::hint::black_box(article);
    }
    let mut durations = Vec::with_capacity(iterations);
    let mut lengths = Vec::with_capacity(iterations);
    let mut checksums = Vec::with_capacity(iterations);
    let mut output_bytes = Vec::with_capacity(iterations);
    let mut statuses = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let start = Instant::now();
        let article = extract_html(
            std::hint::black_box(&case.html),
            std::hint::black_box(&case.options),
        )?;
        let output = if serialize {
            Some(serde_json::to_vec(&article)?)
        } else {
            None
        };
        durations.push(start.elapsed().as_nanos() as u64);
        let text = article.as_ref().map_or("", |a| a.text_content.as_str());
        if !allow_empty && text.is_empty() {
            return Err(format!("{}: extraction returned empty text", case.id).into());
        }
        output_bytes.push(output.as_ref().map_or(0, Vec::len));
        statuses.push(if text.is_empty() { "empty" } else { "ok" });
        lengths.push(text.encode_utf16().count());
        // Stable FNV-1a over UTF-8 text, outside the timed pipeline.
        let checksum = text
            .as_bytes()
            .iter()
            .fold(0xcbf29ce484222325u64, |hash, byte| {
                (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            });
        checksums.push(format!("{checksum:016x}"));
        std::hint::black_box(output);
        std::hint::black_box(article);
    }
    Ok(
        json!({"id":case.id,"durationsNs":durations,"lengths":lengths,"checksums":checksums,"outputBytes":output_bytes,"statuses":statuses}),
    )
}
fn run() -> Result<Value, Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let request: Request = serde_json::from_str(&input)?;
    if request.iterations == 0 {
        return Err("iterations must be greater than zero".into());
    }
    if request.cases.is_empty() {
        return Err("cases must not be empty".into());
    }
    let mut results = Vec::new();
    for case in request.cases {
        results.push(measure_case(
            case,
            request.warmup,
            request.iterations,
            request.serialize,
            request.allow_empty,
        )?);
    }
    Ok(json!({"cases":results}))
}
fn main() {
    match run() {
        Ok(result) => println!("{result}"),
        Err(error) => {
            eprintln!("readability-kit-bench: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialization_is_enabled_by_default_and_can_be_disabled() {
        let request: Request = serde_json::from_str(r#"{"cases":[],"iterations":1}"#).unwrap();
        assert!(request.serialize);
        let request: Request =
            serde_json::from_str(r#"{"cases":[],"iterations":1,"serialize":false}"#).unwrap();
        assert!(!request.serialize);
    }

    #[test]
    fn empty_extraction_cannot_produce_a_successful_measurement() {
        let case = Case {
            id: "empty".into(),
            html: "<html><body></body></html>".into(),
            options: ExtractOptions {
                url: Some("https://example.com/".into()),
                ..ExtractOptions::default()
            },
        };
        assert!(measure_case(case, 0, 1, true, false).is_err());
    }

    #[test]
    fn explicitly_allowed_empty_results_serialize_null_and_record_status() {
        let case = Case {
            id: "empty".into(),
            html: "<html><body></body></html>".into(),
            options: ExtractOptions {
                url: Some("https://example.com/".into()),
                ..ExtractOptions::default()
            },
        };
        let result = measure_case(case, 1, 1, true, true).unwrap();
        assert_eq!(result["statuses"], json!(["empty"]));
        assert_eq!(result["lengths"], json!([0]));
        assert_eq!(result["outputBytes"], json!([4]));
        assert_eq!(result["checksums"], json!(["cbf29ce484222325"]));
    }
}
