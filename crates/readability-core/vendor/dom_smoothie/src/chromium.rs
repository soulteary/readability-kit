// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2010 Arc90 Inc; Mozilla and Chromium contributors.
// Ports from vendor/chromium/Readability.js; see root LICENSES/Apache-2.0.txt.
//! Ports of the Chromium-specific changes in the repository's pinned Readability.js.
//! Kept behind `Config::chromium_mode`; see `READABILITY_KIT_PATCHES.md`.
use crate::glob::{CLASSES_NEGATIVE, CLASSES_POSITIVE, MAYBE_CANDIDATES, UNLIKELY_CANDIDATES};
use crate::helpers::{get_node_matching_string, has_ancestor};
use dom_query::NodeRef;
const RECIPE: &[&str] = &[
    "recipe",
    "ingredients",
    "instructions",
    "directions",
    "steps",
];

pub(crate) fn match_unlikely(value: &str) -> bool {
    let value = value.to_lowercase();
    let unlikely = UNLIKELY_CANDIDATES
        .iter()
        .any(|p| *p != "ad-break" && value.contains(p))
        || ["shopping", "shopper", "retailer"]
            .iter()
            .any(|p| value.contains(p))
        || value
            .match_indices("ad-break")
            .any(|(i, _)| i == 0 || !value.as_bytes()[i - 1].is_ascii_alphanumeric());
    // `layout` is dom_smoothie's extension, not in the pinned JS engine.
    unlikely
        && !MAYBE_CANDIDATES
            .iter()
            .filter(|p| **p != "layout")
            .chain(RECIPE.iter())
            .any(|p| value.contains(p))
}
pub(crate) fn is_unlikely_candidate(node: &NodeRef) -> bool {
    !node.has_name("a")
        && match_unlikely(&get_node_matching_string(node))
        && !has_ancestor(node, Some(0), |n| n.has_name("table") || n.has_name("code"))
}
pub(crate) fn recipe_weight(node: &NodeRef) -> f32 {
    [node.attr("class"), node.attr("id")]
        .into_iter()
        .flatten()
        .map(|s| {
            let s = s.to_lowercase();
            if RECIPE.iter().any(|p| s.contains(p))
                && !CLASSES_POSITIVE.iter().any(|p| s.contains(p))
            {
                25.0
            } else {
                0.0
            }
        })
        .sum()
}
pub(crate) fn has_significant_sibling(candidate: &NodeRef, threshold: f32) -> bool {
    candidate.parent().is_some_and(|parent| {
        parent.element_children().iter().any(|sibling| {
            sibling.id != candidate.id
                && (crate::score::get_node_score(sibling) >= threshold
                    || sibling.text().trim().encode_utf16().count() > 25)
        })
    })
}
pub(crate) fn is_single_image(node: &NodeRef) -> bool {
    let mut current = *node;
    loop {
        if current.has_name("img") {
            return true;
        }
        let children = current.element_children();
        if children.len() != 1 || !current.text().trim().is_empty() {
            return false;
        }
        current = children[0];
    }
}
fn image_score(img: &NodeRef) -> f32 {
    let srcset = img.attr("srcset").unwrap_or_default();
    let alt = img.attr("alt").unwrap_or_default();
    let mut score = 0.0;
    let srcset_len = srcset.encode_utf16().count();
    let alt_len = alt.encode_utf16().count();
    if srcset_len > 0 {
        score += 30.0 + (srcset_len as f32 * 0.1).min(10.0);
    }
    if alt_len > 10 {
        score += 30.0 + (alt_len as f32 * 0.1).min(10.0);
    }
    score
}
fn negative_name(value: &str) -> bool {
    let value = value.to_lowercase();
    CLASSES_NEGATIVE.iter().any(|p| value.contains(p))
        || value == "hid"
        || value.starts_with("hid ")
        || value.ends_with(" hid")
        || value.contains(" hid ")
}
fn credited_caption(value: &str) -> bool {
    let lower = value.to_lowercase();
    let is_word = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    ["credit", "source", "photo:"].iter().any(|word| {
        lower.match_indices(word).any(|(i, _)| {
            let end = i + word.len();
            let start_boundary = i == 0 || !is_word(lower.as_bytes()[i - 1]);
            let left = is_word(lower.as_bytes()[end - 1]);
            let right = end < lower.len() && is_word(lower.as_bytes()[end]);
            start_boundary && left != right
        })
    })
}
fn rate_image<'a>(node: &'a NodeRef<'a>) -> Option<(f32, NodeRef<'a>)> {
    // JS getElementsByTagName excludes the element itself.
    let mut best = None;
    for img in node.find_descendants("img") {
        let score = image_score(&img);
        if best.as_ref().map_or(true, |(s, _)| score > *s) {
            best = Some((score, img));
        }
    }
    let (mut score, img) = best?;
    let class = node.attr("class").unwrap_or_default();
    let id = node.attr("id").unwrap_or_default();
    if class.contains("hero") || id.contains("hero") {
        score += 100.0;
    }
    if negative_name(&class) || negative_name(&id) {
        score -= 50.0;
    }
    let length = node.text().trim().encode_utf16().count();
    if length > 300 {
        score -= 0.25 * (length - 300) as f32;
    }
    Some((score, img))
}
fn rate_caption(node: &NodeRef) -> Option<(f32, String)> {
    if let Some(caption) = node.find_descendants("figcaption").first() {
        return Some((100.0, caption.inner_html().to_string()));
    }
    for (tag, base) in [("cite", 95.0), ("p", 80.0)] {
        let text = node
            .find_descendants(tag)
            .iter()
            .map(|n| n.text().to_string())
            .collect::<Vec<_>>()
            .join(" ");
        if text.is_empty() {
            continue;
        }
        let score = if tag == "p" && credited_caption(&text) {
            95.0
        } else {
            base
        };
        let caption = node.tree.new_element("figcaption");
        caption.set_text(text);
        return Some((score, caption.inner_html().to_string()));
    }
    None
}
pub(crate) fn prepend_lead_image(candidate: &NodeRef, output: &NodeRef) {
    let mut previous = Vec::new();
    let mut current = Some(*candidate);
    for _ in 0..10 {
        while let Some(node) = current {
            if let Some(sibling) = node.prev_element_sibling() {
                current = Some(sibling);
                previous.push(sibling);
                break;
            }
            current = node.parent();
        }
        if current.is_none() {
            break;
        }
    }
    let mut image = None;
    for (index, node) in previous.iter().enumerate() {
        if let Some((score, img)) = rate_image(node) {
            if image.as_ref().map_or(true, |(s, _, _)| score > *s) {
                image = Some((score, index, img));
            }
        }
    }
    let Some((score, index, img)) = image else {
        return;
    };
    if score < 30.0 {
        return;
    }
    let mut caption = None;
    for (i, node) in previous.iter().enumerate().take(index + 1) {
        if let Some((score, html)) = rate_caption(node) {
            if caption.as_ref().map_or(true, |(s, _, _)| score > *s) {
                caption = Some((score, i, html));
            }
        }
    }
    let figure = output.tree.new_element("figure");
    let lead = output.tree.new_element("img");
    lead.set_attr("src", &img.attr("src").unwrap_or_default());
    figure.append_child(&lead);
    previous[index].remove_from_parent();
    if let Some((_, i, html)) = caption {
        let node = output.tree.new_element("figcaption");
        node.set_html(html);
        figure.append_child(&node);
        previous[i].remove_from_parent();
    }
    output.append_child(&figure);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Config, Readability};
    use dom_query::Document;
    #[test]
    fn caption_credit_pattern_preserves_js_boundaries() {
        for text in ["Credit: Example", "Source Example", "photo:a"] {
            assert!(credited_caption(text), "{text}");
        }
        for text in ["photograph", "photo: ", "_credit", "sourceful"] {
            assert!(!credited_caption(text), "{text}");
        }
        assert!(negative_name("hero hid photo"));
        assert!(!negative_name("hero hider photo"));
    }
    #[test]
    fn promotion_uses_scored_or_long_siblings() {
        let doc = Document::from("<div><article>Candidate</article><aside>Short</aside></div>");
        let selection = doc.select("article");
        let candidate = selection.nodes().first().unwrap();
        assert!(!has_significant_sibling(candidate, 10.0));
        let sibling = doc.select("aside");
        crate::score::set_node_score(sibling.nodes().first().unwrap(), 10.0);
        assert!(has_significant_sibling(candidate, 10.0));
        crate::score::set_node_score(sibling.nodes().first().unwrap(), 0.0);
        sibling.set_text(&"🙂".repeat(13));
        assert!(has_significant_sibling(candidate, 10.0));
    }
    #[test]
    fn recipe_bonus_is_used_by_initialization_and_cleanup_weights() {
        let doc = Document::from("<h2 class='comment recipe'>Recipe</h2>");
        let sel = doc.select("h2");
        let node = sel.nodes().first().unwrap();
        assert_eq!(crate::score::get_class_weight(node, true, false), -25.0);
        assert_eq!(crate::score::get_class_weight(node, true, true), 0.0);
        assert_eq!(crate::score::init_node_score(node, true, true), -5.0);
        assert_eq!(crate::score::get_class_weight(node, false, true), 0.0);
    }
    #[test]
    fn token_boundary_and_recipe_candidates() {
        assert!(!match_unlikely("continue-read-break"));
        assert!(!match_unlikely("lead-break"));
        assert!(match_unlikely("ad-break"));
        assert!(match_unlikely("prefix_ad-break"));
        assert!(match_unlikely("shopping"));
        assert!(match_unlikely("shopper"));
        assert!(match_unlikely("retailer"));
        assert!(!match_unlikely("shopping recipe ingredients"));
        assert!(!match_unlikely("comment instructions"));
    }
    #[test]
    fn recipe_class_bonus_once_per_attribute() {
        let doc = Document::from("<div class='recipe ingredients' id='directions'></div>");
        assert_eq!(
            recipe_weight(doc.select("div").nodes().first().unwrap()),
            50.0
        );
        let doc = Document::from("<div class='article recipe'></div>");
        assert_eq!(
            recipe_weight(doc.select("div").nodes().first().unwrap()),
            0.0
        );
    }
    #[test]
    fn lead_image_with_cite_caption_and_duplicate_removal() {
        let doc = Document::from("<body><div class='hero'><img src='hero.jpg' alt='A descriptive photograph'><cite>Photo credit</cite></div><article><p>Article body.</p></article></body>");
        let candidate_sel = doc.select("article");
        let candidate = candidate_sel.nodes().first().unwrap();
        let output = doc.tree.new_element("div");
        prepend_lead_image(candidate, &output);
        assert!(output
            .inner_html()
            .contains("<figcaption>Photo credit</figcaption>"));
        assert_eq!(output.find_descendants("img").len(), 1);
        assert!(!doc.select(".hero").exists());
        assert!(doc.select("article").exists());
    }
    #[test]
    fn caption_prefers_semantic_figcaption() {
        let doc = Document::from("<div><p>source words</p><cite>credit</cite><figcaption><b>Exact caption</b></figcaption></div>");
        let sel = doc.select("div");
        assert_eq!(
            rate_caption(sel.nodes().first().unwrap()),
            Some((100.0, "<b>Exact caption</b>".into()))
        );
    }
    #[test]
    fn single_image_wrappers_require_no_text() {
        let doc = Document::from(
            "<div><div><img src='x'></div></div><section><img src='x'>caption</section>",
        );
        assert!(is_single_image(doc.select("div").nodes().first().unwrap()));
        assert!(!is_single_image(
            doc.select("section").nodes().first().unwrap()
        ));
    }
    #[test]
    fn chromium_jsonld_uses_longer_title_on_tie() {
        let html = r#"<title>Unrelated title here</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"Short","headline":"Longer descriptive headline"}</script><p>Content</p>"#;
        for (chromium_mode, expected) in [(false, "Short"), (true, "Longer descriptive headline")] {
            let ra = Readability::new(
                html,
                Some("https://example.com"),
                Some(Config {
                    chromium_mode,
                    ..Config::default()
                }),
            )
            .unwrap();
            assert_eq!(ra.parse_json_ld().unwrap().title, expected);
        }
    }
    #[test]
    fn readerable_mode_respects_ad_boundary() {
        let html = format!(
            "<p class='continue-read-break'>{}</p>",
            "Article words repeated. ".repeat(50)
        );
        let doc = Document::from(html);
        assert!(!crate::readable::is_probably_readable_mode(
            &doc,
            Some(1.0),
            Some(10),
            false
        ));
        assert!(crate::readable::is_probably_readable_mode(
            &doc,
            Some(1.0),
            Some(10),
            true
        ));
    }
}
