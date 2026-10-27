//! Native article extraction with locked-corpus parity against the pinned JS
//! engines. Uses the patched dom_smoothie algorithm and native output policy.
/// Untyped JSON adapter shared by compatibility tools and WASM bindings.
#[doc(hidden)]
pub mod boundary;
use dom_query::Document;
#[cfg(test)]
use dom_query::Selection;
mod content;
use dom_smoothie::{Config, Readability, ReadabilityError};
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    #[default]
    Chromium,
    Mozilla,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtractOptions {
    pub url: Option<String>,
    pub engine: Engine,
    pub char_threshold: usize,
    pub max_elems_to_parse: usize,
    pub nb_top_candidates: usize,
    pub keep_classes: bool,
    pub classes_to_preserve: Vec<String>,
    #[serde(rename = "disableJSONLD")]
    pub disable_json_ld: bool,
    pub link_density_modifier: f32,
    pub flatten_shadow_roots: bool,
    pub sanitize: bool,
}
impl Default for ExtractOptions {
    fn default() -> Self {
        Self {
            url: None,
            engine: Engine::Chromium,
            char_threshold: 500,
            max_elems_to_parse: 0,
            nb_top_candidates: 5,
            keep_classes: false,
            classes_to_preserve: vec![],
            disable_json_ld: false,
            link_density_modifier: 0.0,
            flatten_shadow_roots: true,
            sanitize: true,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub title: String,
    pub byline: Option<String>,
    pub dir: Option<String>,
    pub lang: Option<String>,
    pub content: String,
    pub text_content: String,
    pub length: usize,
    pub excerpt: Option<String>,
    pub site_name: Option<String>,
    pub published_time: Option<String>,
    pub url: String,
    pub engine: Engine,
}
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("url must be an absolute HTTP(S) URL.")]
    InvalidUrl,
    #[error("charThreshold and nbTopCandidates must be positive; numeric options must be finite")]
    InvalidOptions,
    #[error("charThreshold must be a finite integer greater than or equal to 1.")]
    InvalidThreshold,
    #[error("content processing: {0}")]
    Content(String),
    #[error("minScore must be a finite number greater than or equal to 0.")]
    InvalidReaderableMinScore,
    #[error(transparent)]
    Extraction(#[from] ReadabilityError),
}
fn config(options: &ExtractOptions) -> Config {
    Config {
        char_threshold: options.char_threshold,
        max_elements_to_parse: options.max_elems_to_parse,
        n_top_candidates: options.nb_top_candidates,
        keep_classes: options.keep_classes,
        classes_to_preserve: options.classes_to_preserve.clone(),
        disable_json_ld: options.disable_json_ld,
        link_density_modifier: options.link_density_modifier,
        chromium_mode: options.engine == Engine::Chromium,
        ..Config::default()
    }
}
fn prepare(html: &str, options: &ExtractOptions, public: bool) -> Result<(Document, Url), Error> {
    if public && options.char_threshold == 0 {
        return Err(Error::InvalidThreshold);
    }
    if (public && options.nb_top_candidates == 0) || !options.link_density_modifier.is_finite() {
        return Err(Error::InvalidOptions);
    }
    let source = options
        .url
        .as_ref()
        .and_then(|s| Url::parse(s).ok())
        .filter(|u| !public || (matches!(u.scheme(), "http" | "https") && u.host_str().is_some()))
        .ok_or(Error::InvalidUrl)?;
    let doc = Document::from(html);
    let count = doc.select("*").nodes().len();
    if options.max_elems_to_parse > 0 && count > options.max_elems_to_parse {
        return Err(ReadabilityError::TooManyElements(count, options.max_elems_to_parse).into());
    }
    if !public {
        return Ok((doc, source));
    }
    let base = doc
        .select("base[href]")
        .attr("href")
        .and_then(|s| source.join(&s).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .unwrap_or_else(|| source.clone());
    for node in doc.select("img[src]").nodes() {
        if let Some(src) = node.attr("src") {
            // Blank placeholders must remain blank until lazy-image recovery
            // can replace them with the real address from data attributes.
            if src.trim().is_empty() {
                continue;
            }
            if let Ok(url) = base.join(&src) {
                node.set_attr("src", url.as_str());
            }
        }
    }

    Ok((doc, source))
}
pub fn extract_raw_html(html: &str, options: &ExtractOptions) -> Result<Option<Article>, Error> {
    extract_impl(html, options, false)
}
fn extract_impl(
    html: &str,
    options: &ExtractOptions,
    public: bool,
) -> Result<Option<Article>, Error> {
    let (doc, source) = prepare(html, options, public)?;
    let mut cfg = config(options);
    // Count the original input once; the base URI is metadata, not a DOM node.
    if public {
        cfg.max_elements_to_parse = 0;
        cfg.base_url = Some(
            doc.select("base[href]")
                .attr("href")
                .and_then(|s| source.join(&s).ok())
                .filter(|u| matches!(u.scheme(), "http" | "https"))
                .unwrap_or_else(|| source.clone())
                .to_string(),
        );
    }
    if !public {
        if cfg.char_threshold == 0 {
            cfg.char_threshold = 500;
        }
        if cfg.n_top_candidates == 0 {
            cfg.n_top_candidates = 5;
        }
    }
    let mut reader = Readability::with_document(doc, Some(source.as_str()), Some(cfg))?;
    let raw = match reader.parse() {
        Ok(a) => a,
        Err(ReadabilityError::GrabFailed) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let text_content = raw.text_content.to_string();
    let root = reader
        .article_root()
        .ok_or_else(|| Error::Content("article root missing".into()))?;
    let serialized = content::exact_outer(root);
    Ok(Some(Article {
        title: raw.title,
        byline: if public {
            nullable(raw.byline)
        } else {
            raw.byline
        },
        dir: if public { nullable(raw.dir) } else { raw.dir },
        lang: if public { nullable(raw.lang) } else { raw.lang },
        content: serialized,
        length: text_content.encode_utf16().count(),
        text_content,
        excerpt: if public {
            nullable(raw.excerpt)
        } else {
            raw.excerpt
        },
        site_name: if public {
            nullable(raw.site_name)
        } else {
            raw.site_name
        },
        published_time: if public {
            nullable(raw.published_time)
        } else {
            raw.published_time
        },
        url: source.to_string(),
        engine: options.engine,
    }))
}
pub fn extract_html(html: &str, options: &ExtractOptions) -> Result<Option<Article>, Error> {
    let Some(mut article) = extract_impl(html, options, true)? else {
        return Ok(None);
    };
    let (content, text) =
        content::process_content(&article.content, options.sanitize).map_err(Error::Content)?;
    article.content = content;
    article.text_content = text;
    article.length = article.text_content.encode_utf16().count();
    Ok(Some(article))
}
fn nullable(value: Option<String>) -> Option<String> {
    value.filter(|s| !s.is_empty())
}
#[cfg(test)]
fn clean_content(doc: &Document) {
    for node in doc.select("body *").nodes() {
        if !node
            .ancestors_it(None)
            .any(|parent| parent.has_name("body"))
        {
            continue;
        }
        let sel = Selection::from(*node);
        let text = node.text();
        let trimmed = text.trim();
        let media = sel
            .select("img,canvas,picture,video,audio,iframe,svg,math")
            .exists()
            || [
                "img", "canvas", "picture", "video", "audio", "iframe", "svg", "math",
            ]
            .iter()
            .any(|s| node.has_name(s));
        if media {
            continue;
        }
        let live = node
            .attr("aria-live")
            .is_some_and(|s| matches!(s.as_ref(), "polite" | "assertive"));
        let announcement = live
            || node
                .attr("role")
                .is_some_and(|s| matches!(s.as_ref(), "alert" | "status" | "log"));
        if (announcement && trimmed.encode_utf16().count() < 200)
            || [
                "advertisement",
                "sponsored",
                "supported by",
                "skip advertisement",
            ]
            .contains(&trimmed.to_lowercase().as_str())
        {
            node.remove_from_parent();
            continue;
        }
        let inline = ["span", "b", "i", "strong", "em"]
            .iter()
            .any(|s| node.has_name(s));
        let wrapper = inline
            || [
                "div",
                "p",
                "section",
                "aside",
                "header",
                "footer",
                "article",
                "main",
                "nav",
                "figure",
                "figcaption",
                "ul",
                "ol",
                "li",
            ]
            .iter()
            .any(|s| node.has_name(s));
        if wrapper && trimmed.is_empty() {
            // Preserve an inline separator conservatively; removing it joins words.
            if inline
                && !text.is_empty()
                && node
                    .prev_sibling()
                    .is_some_and(|n| !n.text().trim().is_empty())
                && node
                    .next_sibling()
                    .is_some_and(|n| !n.text().trim().is_empty())
            {
                sel.replace_with_html(" ")
            } else {
                node.remove_from_parent()
            }
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ReaderableOptions {
    pub engine: Engine,
    pub min_content_length: usize,
    pub min_score: f32,
    pub flatten_shadow_roots: bool,
}
impl Default for ReaderableOptions {
    fn default() -> Self {
        Self {
            engine: Engine::Chromium,
            min_content_length: 140,
            min_score: 20.0,
            flatten_shadow_roots: true,
        }
    }
}
pub fn is_probably_readerable(html: &str, options: &ReaderableOptions) -> Result<bool, Error> {
    if !options.min_score.is_finite() || options.min_score < 0.0 {
        return Err(Error::InvalidReaderableMinScore);
    }
    let doc = Document::from(html);
    let reader = Readability::with_document(
        doc,
        None,
        Some(Config {
            readable_min_content_length: options.min_content_length,
            readable_min_score: options.min_score,
            chromium_mode: options.engine == Engine::Chromium,
            ..Config::default()
        }),
    )?;
    Ok(reader.is_probably_readable())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn opts() -> ExtractOptions {
        ExtractOptions {
            url: Some("https://example.com/news/page".into()),
            char_threshold: 1,
            ..Default::default()
        }
    }
    fn page(extra: &str) -> String {
        format!("<html lang='zh'><head><title>A useful article title</title></head><body><article><h1>A useful article title</h1><p>{} {extra}</p></article></body></html>","This is a substantial article, with explanatory prose and useful information. ".repeat(15))
    }
    #[test]
    fn output_length_is_utf16_and_unicode_is_preserved() {
        let a = extract_html(&page("中文😀"), &opts()).unwrap().unwrap();
        assert!(a.text_content.contains("中文😀"));
        assert_eq!(a.length, a.text_content.encode_utf16().count());
        assert!(a.length > a.text_content.chars().count());
    }
    #[test]
    fn resolves_source_base_and_removes_active_markup() {
        let html=page("<a href='../target'>reference</a><img src='photo.jpg' onerror='alert(1)'><script>alert(2)</script>").replace("<head>","<head><base href='/assets/'>");
        let a = extract_html(&html, &opts()).unwrap().unwrap();
        assert!(
            a.content.contains("https://example.com/assets/photo.jpg"),
            "{}",
            a.content
        );
        assert!(a.content.contains("https://example.com/target"));
        assert!(!a.content.contains("onerror"));
        assert!(!a.content.contains("<script"));
    }
    #[test]
    fn mathematical_content_survives_sanitization() {
        let article = extract_html(
            &page("<math display='inline'><mfrac><mi>x</mi><mn>2</mn></mfrac></math>"),
            &opts(),
        )
        .unwrap()
        .unwrap();
        assert!(article.content.contains("<math"), "{}", article.content);
        assert!(article.content.contains("<mfrac>"));
        assert!(article.text_content.contains("x2"));
    }
    #[test]
    fn invalid_url_and_limits_are_errors() {
        let mut o = opts();
        o.url = Some("file:///tmp/test.html".into());
        assert!(matches!(extract_html("", &o), Err(Error::InvalidUrl)));
        o = opts();
        o.max_elems_to_parse = 1;
        assert!(matches!(
            extract_html(&page(""), &o),
            Err(Error::Extraction(ReadabilityError::TooManyElements(..)))
        ));
        o = opts();
        o.nb_top_candidates = 0;
        assert!(extract_html("", &o).is_err());
    }
    #[test]
    fn element_limit_counts_source_nodes_before_base_replacement() {
        for bases in [
            "",
            "<base href='/assets/'>",
            "<base href='/a/'><base href='/b/'>",
        ] {
            let html = page("").replace("<head>", &format!("<head>{bases}"));
            let count = Document::from(html.as_str()).select("*").nodes().len();
            for engine in [Engine::Chromium, Engine::Mozilla] {
                for limit in [count - 1, count, count + 1] {
                    let mut options = opts();
                    options.engine = engine;
                    options.max_elems_to_parse = limit;
                    let result = extract_html(&html, &options);
                    if limit < count {
                        assert!(
                            matches!(result, Err(Error::Extraction(ReadabilityError::TooManyElements(n, max))) if n == count && max == limit)
                        );
                    } else {
                        assert!(result.unwrap().is_some(), "bases={bases:?}, limit={limit}");
                    }
                }
            }
        }
    }
    #[test]
    fn arbitrary_preserved_class_strings_do_not_panic_or_become_selectors() {
        let html = page("").replace("<p>", "<p class='keep.foo a:b drop'>");
        for engine in [Engine::Chromium, Engine::Mozilla] {
            let mut options = opts();
            options.engine = engine;
            options.classes_to_preserve =
                vec!["".into(), "keep.foo".into(), "a:b".into(), "[".into()];
            let article = extract_html(&html, &options).unwrap().unwrap();
            let output = Document::from(article.content.as_str());
            assert_eq!(
                output.select("p").attr("class").as_deref(),
                Some("keep.foo a:b")
            );
        }
    }
    #[test]
    fn semantic_cleanup_preserves_separators_and_media() {
        let doc=Document::from("<body><p>hello<span> </span>world</p><div role='status'>Loaded</div><div aria-live='off'>Keep me</div><p>Advertisement</p><p>This discusses sponsored research.</p><div><img src='a'></div></body>");
        clean_content(&doc);
        let text = doc.select("body").text().to_string();
        assert!(text.contains("hello world"));
        assert!(!text.contains("Loaded"));
        assert!(!text.contains("Advertisement"));
        assert!(text.contains("Keep me"));
        assert!(text.contains("sponsored research"));
        assert!(doc.select("img").exists());
    }
    #[test]
    fn options_deserialize_partial_and_reject_unknown() {
        let o: ExtractOptions =
            serde_json::from_str(r#"{"url":"https://example.com","disableJSONLD":true}"#).unwrap();
        assert!(o.disable_json_ld);
        assert_eq!(o.char_threshold, 500);
        assert!(o.sanitize);
        assert!(serde_json::from_str::<ExtractOptions>(r#"{"unknown":true}"#).is_err());
    }
    #[test]
    fn raw_zero_threshold_uses_engine_default_but_public_rejects_it() {
        let mut options = opts();
        options.char_threshold = 0;
        assert!(matches!(
            extract_html(&page(""), &options),
            Err(Error::InvalidThreshold)
        ));
        assert!(extract_raw_html(&page(""), &options).unwrap().is_some());
    }
    #[test]
    fn readerability_and_empty_input() {
        assert!(is_probably_readerable(&page(""), &ReaderableOptions::default()).unwrap());
        assert!(!is_probably_readerable("<p>short</p>", &ReaderableOptions::default()).unwrap());
        assert!(extract_html("", &opts()).unwrap().is_none());
    }
}
