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
}
fn run() -> Result<Value, Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let request: Request = serde_json::from_str(&input)?;
    if request.iterations == 0 {
        return Err("iterations must be greater than zero".into());
    }
    let mut results = Vec::new();
    for case in request.cases {
        for _ in 0..request.warmup {
            std::hint::black_box(extract_html(&case.html, &case.options)?);
        }
        let mut durations = Vec::with_capacity(request.iterations);
        let mut lengths = Vec::with_capacity(request.iterations);
        let mut checksums = Vec::with_capacity(request.iterations);
        for _ in 0..request.iterations {
            let start = Instant::now();
            let article = extract_html(
                std::hint::black_box(&case.html),
                std::hint::black_box(&case.options),
            )?;
            durations.push(start.elapsed().as_nanos() as u64);
            let text = article
                .as_ref()
                .map(|a| a.text_content.as_str())
                .unwrap_or("");
            lengths.push(text.encode_utf16().count());
            // Stable FNV-1a checksum outside the timed extraction section.
            let checksum = text
                .as_bytes()
                .iter()
                .fold(0xcbf29ce484222325u64, |hash, byte| {
                    (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
                });
            checksums.push(format!("{checksum:016x}"));
            std::hint::black_box(article);
        }
        results.push(
            json!({"id":case.id,"durationsNs":durations,"lengths":lengths,"checksums":checksums}),
        );
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
