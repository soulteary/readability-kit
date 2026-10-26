#![no_main]
use libfuzzer_sys::fuzz_target;
use readability_core::{extract_html, Engine, ExtractOptions};
fuzz_target!(|input: &[u8]| {
    // Bound corpus entry size; libFuzzer's -timeout bounds a stalled execution.
    if input.len() > 256 * 1024 {
        return;
    }
    let html = String::from_utf8_lossy(input);
    for engine in [Engine::Chromium, Engine::Mozilla] {
        let options = ExtractOptions {
            engine,
            url: Some("https://fuzz.example/articles/page".into()),
            max_elems_to_parse: 10_000,
            // Exercise selector construction with valid arbitrary class option strings.
            classes_to_preserve: vec![
                String::from_utf8_lossy(&input[..input.len().min(64)]).into_owned(),
                "[x]\\:😀\"' # . > + ~ , ()".into(),
            ],
            ..Default::default()
        };
        let result = extract_html(&html, &options);
        if let Ok(Some(article)) = &result {
            assert_eq!(article.length, article.text_content.encode_utf16().count());
        }
        let snapshot =
            |result: Result<Option<readability_core::Article>, readability_core::Error>| {
                match result {
                    Ok(Some(article)) => serde_json::json!({"status":"ok", "article":article}),
                    Ok(None) => serde_json::json!({"status":"empty"}),
                    Err(error) => serde_json::json!({"status":"error", "error":error.to_string()}),
                }
            };
        assert_eq!(snapshot(result), snapshot(extract_html(&html, &options)));
    }
});
