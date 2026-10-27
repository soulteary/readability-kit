use super::*;
#[test]
fn unsafe_attributes_and_semantic_cleanup() {
    let (html,text)=process_content("<p onclick='x()'>safe <b> </b>text<a href='javascript:alert(1)'>link</a></p><script>bad()</script><div role='status'>Loading</div>",true).unwrap();
    assert_eq!(html, "<p>safe  text<a>link</a></p>");
    assert_eq!(text, "safe  textlink");
}
#[test]
fn preserves_foreign_content() {
    let (html, _) = process_content(
        "<svg viewBox='0 0 10 10'><circle cx='2' onload='x()'/></svg><math><mi>x</mi></math>",
        true,
    )
    .unwrap();
    assert_eq!(
        html,
        "<svg viewBox=\"0 0 10 10\"><circle cx=\"2\"></circle></svg><math><mi>x</mi></math>"
    );
}
#[test]
#[ignore = "diagnostic corpus audit; needs generated JS baseline"]
fn corpus_cleanup_audit() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../go-reports/javascript.json");
    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let cases = json["cases"].as_array().unwrap();
    let mut differences = Vec::new();
    let mut count = 0;
    for api in cases.iter().filter(|c| c["layer"] == "api") {
        if api["result"]["status"] != "ok" {
            continue;
        }
        let Some(id) = api["id"].as_str() else {
            continue;
        };
        let rid = id.trim_end_matches("/api").to_owned() + "/raw";
        let Some(raw) = cases.iter().find(|c| c["id"] == rid) else {
            continue;
        };
        let Some(rawhtml) = raw["result"]["article"]["content"].as_str() else {
            continue;
        };
        let expected = &api["result"]["article"];
        let (html, text) = process_content(rawhtml, api["options"]["sanitize"] != false).unwrap();
        count += 1;
        if expected["content"] != html || expected["textContent"] != text {
            let exp = expected["content"].as_str().unwrap_or("");
            let off = html
                .bytes()
                .zip(exp.bytes())
                .position(|(a, b)| a != b)
                .unwrap_or(html.len().min(exp.len()));
            differences.push(serde_json::json!({"id":id,"offset":off,"actual":html,"expected":exp,"textEqual":expected["textContent"]==text}));
        }
    }
    std::fs::write(
        "/tmp/rust-cleanup-differences.json",
        serde_json::to_vec_pretty(&differences).unwrap(),
    )
    .unwrap();
    assert_eq!(
        differences.len(),
        0,
        "{} / {} cleanup differences; see /tmp/rust-cleanup-differences.json",
        differences.len(),
        count
    );
}
#[test]
fn sanitizes_children_after_unwrapping_unknown_elements() {
    let (html, text) = process_content("<unknown><wrapper><img src='javascript:alert(1)' onerror='alert(1)'><a href='java&#10;script:alert(1)'>ok</a></wrapper></unknown>", true).unwrap();
    assert_eq!(html, "<img><a>ok</a>");
    assert_eq!(text, "ok");
}
#[test]
fn removes_clobbering_names_and_retains_safe_data_attributes() {
    let (html, _) = process_content("<p id='location' name='constructor' data-note='javascript:literal' aria-label='Label' style='color:red'>Text</p>", true).unwrap();
    assert_eq!(
        html,
        "<p data-note=\"javascript:literal\" aria-label=\"Label\">Text</p>"
    );
}
#[test]
fn preserves_namespace_attributes_and_html_attribute_escaping() {
    let (html, _) = process_content("<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><image xlink:href='data:image/png;base64,AA=='/></svg><p title='&lt;quoted&gt;&quot;&amp;'>Text</p>", true).unwrap();
    assert_eq!(html, "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"><image xlink:href=\"data:image/png;base64,AA==\"></image></svg><p title=\"<quoted>&quot;&amp;\">Text</p>");
}
#[test]
fn exact_text_keeps_whitespace_and_sanitize_false_keeps_attributes() {
    let (html, text) = process_content(" \n<p onclick='x()'>A\n B&nbsp;C</p>", false).unwrap();
    assert_eq!(html, " \n<p onclick=\"x()\">A\n B&nbsp;C</p>");
    assert_eq!(text, " \nA\n B\u{a0}C");
}

// Expected output verified against pinned DOMPurify 3.4.17 and the JS API's
// FORBID_TAGS/FORBID_ATTR options. Policy keys are lowercase; SVG serialization
// preserves canonical mixed-case names.
#[test]
fn preserves_svg_filter_names_and_removes_unsafe_attributes() {
    let input = r#"<svg><filter id="blur"><feGaussianBlur stdDeviation="2" onload="bad()"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1"/></feComponentTransfer><feImage href="javascript:alert(1)"/><feUnknown><feOffset dx="1"/></feUnknown></filter></svg>"#;
    let expected = r#"<svg><filter><feGaussianBlur stdDeviation="2"></feGaussianBlur><feColorMatrix type="saturate" values="0"></feColorMatrix><feComponentTransfer><feFuncR type="linear" slope="1"></feFuncR></feComponentTransfer><feImage></feImage><feOffset dx="1"></feOffset></filter></svg>"#;
    for html in [input.to_owned(), input.to_ascii_lowercase()] {
        let (actual, _) = process_content(&html, true).unwrap();
        assert_eq!(actual, expected);
    }
}
