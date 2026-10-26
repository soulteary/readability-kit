// SPDX-License-Identifier: Apache-2.0
//! Adversarial acceptance tests over the complete extraction pipeline.
use dom_query::Document;
use readability_core::{extract_html, Engine, ExtractOptions};
fn options(engine: Engine) -> ExtractOptions {
    ExtractOptions {
        engine,
        url: Some("https://news.example/articles/page".into()),
        ..Default::default()
    }
}
fn page(payload: &str) -> String {
    format!("<!doctype html><html><head><title>Native regression report</title></head><body><article><h1>Native regression report</h1><p>{}</p>{payload}<p>{}</p></article></body></html>", "Evidence needs careful interpretation, detailed context, and independently reproducible observations. ".repeat(20), "This conclusion follows the evidence, while acknowledging limits and alternative interpretations. ".repeat(20))
}
fn assert_inert(content: &str) {
    // Reparse twice: sanitizer output is consumed as HTML, not as an opaque string.
    let first = Document::from(format!("<html><body>{content}</body></html>"));
    let serialized = first.select("body").inner_html();
    let reparsed = Document::from(format!("<body>{serialized}</body>"));
    assert!(
        !reparsed
            .select(
                "script,iframe,object,embed,form,input,button,textarea,select,style,link,meta,base"
            )
            .exists(),
        "active element retained: {content}"
    );
    for node in reparsed.select("*").nodes() {
        for name in [
            "onclick",
            "onerror",
            "onload",
            "onfocus",
            "onmouseover",
            "srcdoc",
            "style",
        ] {
            assert!(
                node.attr(name).is_none(),
                "active attribute {name} retained: {content}"
            );
        }
        if let Some(value) = node.attr("srcset") {
            for candidate in value.split(',') {
                let address = candidate.split_whitespace().next().unwrap_or("");
                let address = address.to_ascii_lowercase();
                assert!(
                    !address.starts_with("javascript:")
                        && !address.starts_with("vbscript:")
                        && !address.starts_with("data:"),
                    "unsafe srcset {value}"
                );
            }
        }
        for name in ["href", "src", "xlink:href", "action", "formaction"] {
            if let Some(value) = node.attr(name) {
                let compact: String = value
                    .chars()
                    .filter(|c| !c.is_ascii_control() && !c.is_ascii_whitespace())
                    .collect();
                let compact = compact.to_ascii_lowercase();
                assert!(
                    !compact.starts_with("javascript:")
                        && !compact.starts_with("vbscript:")
                        && !compact.starts_with("data:text/html"),
                    "unsafe URL {value}"
                );
            }
        }
    }
}
#[test]
fn adversarial_markup_is_inert_after_reparse_in_both_modes() {
    let payloads = [
        "<p><img src='/safe.png' srcset='javascript:alert(1) 1x, https://images.example/safe.jpg 2x'></p>",
        "<p onclick='alert(1)'>Visible payload text<img src='/image.png' onerror='alert(1)'></p>",
        "<p><a href='jav&#x09;ascript:alert(1)'>Unsafe link with meaningful anchor</a></p>",
        "<p><a href='data:text/html,<script>alert(1)</script>'>Unsafe data link</a></p>",
        "<form action='/submit'><input autofocus onfocus='alert(1)'><button formaction='javascript:alert(1)'>Submit</button><textarea>Draft</textarea></form>",
        "<svg><a xlink:href='javascript:alert(1)'><text>Vector reference</text></a><foreignObject><p onmouseover='alert(1)'>Foreign text</p></foreignObject></svg>",
        "<math><mtext><table><mglyph><style><!--</style><img title='--><img src=x onerror=alert(1)>'></table></mtext></math>",
        "<p style='background:url(javascript:alert(1))'>Styled text</p><iframe srcdoc='<script>alert(1)</script>'></iframe>",
        "<noscript><p title='</noscript><img src=x onerror=alert(1)>'>Fallback</p></noscript>",
    ];
    for engine in [Engine::Chromium, Engine::Mozilla] {
        for payload in payloads {
            let article = extract_html(&page(payload), &options(engine))
                .unwrap()
                .expect("substantial article survives");
            assert!(article
                .text_content
                .contains("Evidence needs careful interpretation"));
            assert_inert(&article.content);
        }
    }
}
#[test]
fn unicode_and_safe_base_media_survive_complete_pipeline() {
    for engine in [Engine::Chromium, Engine::Mozilla] {
        let html=page("<p>中文😀👩🏽‍💻 é &amp; 日本語</p><p><a href='../reference'>Evidence source</a><img data-src='lazy.jpg' alt='Evidence image'></p>")
            .replace("<head>", "<head><base href='https://cdn.example/assets/posts/'>");
        let article = extract_html(&html, &options(engine)).unwrap().unwrap();
        assert!(article.text_content.contains("中文😀👩🏽‍💻 é & 日本語"));
        assert_eq!(article.length, article.text_content.encode_utf16().count());
        assert!(
            article
                .content
                .contains("https://cdn.example/assets/reference"),
            "{}",
            article.content
        );
        assert!(
            article
                .content
                .contains("https://cdn.example/assets/posts/lazy.jpg"),
            "{}",
            article.content
        );
        assert_eq!(article.url, "https://news.example/articles/page");
    }
}

#[test]
fn nested_sections_keep_opening_and_closing_prose() {
    for engine in [Engine::Chromium, Engine::Mozilla] {
        let html = page("<section>Opening<section><p>Body text</p></section>Closing</section>");
        let article = extract_html(&html, &options(engine)).unwrap().unwrap();
        assert!(
            article.text_content.contains("OpeningBody textClosing"),
            "{}",
            article.content
        );
    }
}

#[test]
fn responsive_image_candidates_survive_resolution_and_sanitization() {
    for engine in [Engine::Chromium, Engine::Mozilla] {
        for sanitize in [false, true] {
            for srcset in [
                "small.jpg 1x,large.jpg 2x",
                "small.jpg\t1x,\nlarge.jpg 2x",
                "small.jpg 320w,large.jpg 640w",
            ] {
                let html = page(&format!(
                    "<figure><picture><source srcset='{srcset}'><img srcset='{srcset}' alt='Article illustration'></picture><figcaption>Article figure</figcaption></figure>"
                )).replace("<head>", "<head><base href='https://cdn.example/assets/'>");
                let mut opts = options(engine);
                opts.sanitize = sanitize;
                let article = extract_html(&html, &opts).unwrap().unwrap();
                let doc = Document::from(article.content.as_str());
                let img = doc.select("img");
                let actual = img
                    .attr("srcset")
                    .expect("srcset-only image keeps candidates");
                assert!(
                    actual.contains("https://cdn.example/assets/small.jpg"),
                    "{actual}"
                );
                assert!(
                    actual.contains("https://cdn.example/assets/large.jpg"),
                    "{actual}"
                );
                assert_eq!(doc.select("source").attr("srcset"), Some(actual));
            }
        }
    }
}
#[test]
fn empty_limits_and_invalid_options_are_distinct() {
    for engine in [Engine::Chromium, Engine::Mozilla] {
        let mut opts = options(engine);
        assert!(extract_html("<html><body></body></html>", &opts)
            .unwrap()
            .is_none());
        opts.max_elems_to_parse = 10;
        assert!(extract_html(&page(&"<span>x</span>".repeat(50)), &opts).is_err());
        opts = options(engine);
        opts.nb_top_candidates = 0;
        assert!(extract_html(&page(""), &opts).is_err());
        opts = options(engine);
        opts.link_density_modifier = f32::NAN;
        assert!(extract_html(&page(""), &opts).is_err());
        for source in [
            "javascript:alert(1)",
            "file:///tmp/page.html",
            "relative/page",
            "",
        ] {
            opts = options(engine);
            opts.url = Some(source.into());
            assert!(extract_html(&page(""), &opts).is_err());
        }
    }
}
#[test]
fn deterministic_malformed_smoke_corpus_never_panics() {
    let fragments = [
        "<div>",
        "</table>",
        "<!--",
        "\0",
        "😀",
        "<template><p>",
        "<svg><foreignObject>",
        "<math><mtext>",
        "<img src=x>",
        "&notit;",
        "<p><a href='//example.com'>source</a>",
    ];
    for engine in [Engine::Chromium, Engine::Mozilla] {
        for index in 0..64 {
            let payload = (0..8)
                .map(|offset| fragments[(index * 7 + offset * 3) % fragments.len()])
                .collect::<String>();
            if let Some(article) = extract_html(&page(&payload), &options(engine))
                .expect("malformed HTML remains parseable")
            {
                assert_eq!(article.length, article.text_content.encode_utf16().count());
                assert_inert(&article.content);
            }
        }
    }
}
