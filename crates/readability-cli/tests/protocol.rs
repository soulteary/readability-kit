use std::{
    io::Write,
    process::{Command, Stdio},
};
fn invoke(binary: &str, value: serde_json::Value) -> std::process::Output {
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(value.to_string().as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}
#[test]
fn compatibility_reports_errors_without_process_failure() {
    let binary = env!("CARGO_BIN_EXE_readability-kit-compat");
    for value in [
        serde_json::json!({"html":"", "layer":"unknown"}),
        serde_json::json!({"html":"", "options":{"unknown":true}}),
    ] {
        let output = invoke(binary, value);
        assert!(output.status.success());
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["status"], "error");
        assert!(value["error"].is_string());
        assert!(value["article"].is_null());
    }
    let output = invoke(
        binary,
        serde_json::json!({"html":"<html><body></body></html>", "options":{"engine":"mozilla", "url":"https://example.com/"}, "layer":"api"}),
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["status"], "empty");
}
#[test]
fn benchmark_measures_each_iteration_and_rejects_zero() {
    let binary = env!("CARGO_BIN_EXE_readability-kit-bench");
    let case = serde_json::json!({"id":"empty", "html":"<html><body></body></html>", "options":{"engine":"mozilla", "url":"https://example.com/"}});
    let output = invoke(
        binary,
        serde_json::json!({"cases":[case], "warmup":1,"iterations":3}),
    );
    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        value["cases"][0]["durationsNs"].as_array().unwrap().len(),
        3
    );
    assert_eq!(value["cases"][0]["lengths"], serde_json::json!([0, 0, 0]));
    let output = invoke(binary, serde_json::json!({"cases":[],"iterations":0}));
    assert_eq!(output.status.code(), Some(1));
}

#[test]
fn raw_protocol_omits_wrapper_fields_but_preserves_nullable_metadata() {
    let html=format!("<html><head><title>A useful article title</title></head><body><article><p>{}</p></article></body></html>","Evidence needs careful interpretation, detailed context, and independently reproducible observations. ".repeat(20));
    let binary = env!("CARGO_BIN_EXE_readability-kit-compat");
    for layer in ["api", "raw"] {
        let output = invoke(
            binary,
            serde_json::json!({"html":html,"options":{"url":"https://example.com/article","engine":"mozilla"},"layer":layer}),
        );
        assert!(output.status.success());
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["status"], "ok");
        let article = value["article"].as_object().unwrap();
        assert_eq!(article.contains_key("url"), layer == "api");
        assert_eq!(article.contains_key("engine"), layer == "api");
        for field in ["byline", "dir", "lang", "siteName", "publishedTime"] {
            assert!(article.contains_key(field));
            assert!(
                article[field].is_null(),
                "unexpected metadata {field}: {}",
                article[field]
            );
        }
    }
}

#[test]
fn readerable_protocol_returns_booleans_and_validates_its_own_options() {
    let binary = env!("CARGO_BIN_EXE_readability-kit-compat");
    for engine in ["chromium", "mozilla"] {
        for (html, expected) in [
            (format!("<p>{}</p>", "😀".repeat(141)), true),
            ("<p>short</p>".into(), false),
        ] {
            let output = invoke(
                binary,
                serde_json::json!({"html":html,"layer":"readerable","options":{"engine":engine,"minContentLength":140,"minScore":1}}),
            );
            assert!(output.status.success());
            let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(value, serde_json::json!({"status":"ok","article":expected}));
        }
    }
    for options in [
        serde_json::json!({"minScore":-1}),
        serde_json::json!({"minContentLength":null}),
        serde_json::json!({"engine":"unknown"}),
    ] {
        let output = invoke(
            binary,
            serde_json::json!({"html":"<p>text</p>","layer":"readerable","options":options}),
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["status"], "error");
        assert!(value["article"].is_null());
    }
    let output = invoke(
        binary,
        serde_json::json!({"html":"<p>short</p>","layer":"readerable"}),
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value, serde_json::json!({"status":"ok","article":false}));
}

#[test]
fn readerable_validation_matches_js_order_and_messages() {
    let binary = env!("CARGO_BIN_EXE_readability-kit-compat");
    let cases = [
        (serde_json::json!(null), "options must be an object."),
        (serde_json::json!([]), "options must be an object."),
        (
            serde_json::json!({"engine":true,"minScore":-1}),
            "engine must be \"chromium\" or \"mozilla\".",
        ),
        (
            serde_json::json!({"flattenShadowRoots":null,"minScore":-1}),
            "flattenShadowRoots must be a boolean.",
        ),
        (
            serde_json::json!({"minContentLength":1.5,"minScore":-1}),
            "minContentLength must be a finite integer greater than or equal to 0.",
        ),
        (
            serde_json::json!({"minContentLength":-1}),
            "minContentLength must be a finite integer greater than or equal to 0.",
        ),
        (
            serde_json::json!({"minScore":"1"}),
            "minScore must be a finite number greater than or equal to 0.",
        ),
        (
            serde_json::json!({"minScore":null}),
            "minScore must be a finite number greater than or equal to 0.",
        ),
    ];
    for (options, message) in cases {
        let output = invoke(
            binary,
            serde_json::json!({"html":"<p>short</p>","layer":"readerable","options":options}),
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["error"], message);
    }
    for options in [
        serde_json::json!({"engine":null,"unknown":true}),
        serde_json::json!({"minContentLength":140.0,"minScore":1e100}),
        serde_json::json!({"minContentLength":1e100}),
    ] {
        let output = invoke(
            binary,
            serde_json::json!({"html":"<p>short</p>","layer":"readerable","options":options}),
        );
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value, serde_json::json!({"status":"ok","article":false}));
    }
}
