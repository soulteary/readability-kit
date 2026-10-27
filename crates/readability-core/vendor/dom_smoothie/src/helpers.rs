use std::collections::HashSet;

use foldhash::HashMap;

use dom_query::{NodeId, NodeRef, Selection};

use tendril::StrTendril;

use crate::glob::{MINI_ARIA_HIDDEN, MINI_FALLBACK_IMG, PHRASING_ELEMS};
use crate::matching::is_invisible_style;

/// JavaScript `\s` / `trim` set (Rust's Unicode whitespace also includes NEL).
pub(crate) fn js_whitespace(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// `_getInnerText(node).length`, measured in UTF-16 code units.
pub(crate) fn inner_text_length(node: &NodeRef) -> usize {
    let text = node.text();
    let mut length = 0;
    let mut pending_space = false;
    for c in text.chars() {
        if js_whitespace(c) {
            pending_space = length != 0;
        } else {
            length += usize::from(pending_space) + c.len_utf16();
            pending_space = false;
        }
    }
    length
}

pub(crate) fn text_similarity(text_a: &str, text_b: &str) -> f64 {
    // JavaScript's /\W+/ is ASCII, including underscore as a word character.
    let a = text_a.to_lowercase();
    let b = text_b.to_lowercase();
    let tokenize = |c: char| !c.is_ascii_alphanumeric() && c != '_';
    let tokens_a: HashSet<&str> = a.split(tokenize).filter(|s| !s.is_empty()).collect();
    let tokens_b: Vec<&str> = b.split(tokenize).filter(|s| !s.is_empty()).collect();
    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }
    let unique: Vec<&str> = tokens_b
        .iter()
        .copied()
        .filter(|s| !tokens_a.contains(s))
        .collect();
    1.0 - unique.join(" ").len() as f64 / tokens_b.join(" ").len() as f64
}

pub(crate) fn is_phrasing_content(node: &NodeRef) -> bool {
    if node.is_text() {
        return true;
    }

    // only elements has a node name
    let Some(qual_name) = node.qual_name_ref() else {
        return false;
    };
    let node_name = qual_name.local.as_ref();
    if PHRASING_ELEMS.contains(node_name) {
        return true;
    }

    if matches!(node_name, "a" | "del" | "ins") {
        // There is no big sense to consider link content as phrasing content if they doesn't have children element.
        let children = node.children();
        return children.into_iter().all(|n| is_phrasing_content(&n));
    }
    false
}

pub(crate) fn is_whitespace(node: &NodeRef) -> bool {
    if node.is_text() && node.text().chars().all(js_whitespace) {
        return true;
    }
    // only an element node has a node_name
    node.has_name("br")
}

pub(crate) fn has_ancestor<F>(node: &NodeRef, max_depth: Option<usize>, filter_fn: F) -> bool
where
    F: Fn(&NodeRef) -> bool,
{
    let max_depth = max_depth.map(|max_depth| if max_depth == 0 { 3 } else { max_depth });
    node.ancestors_it(max_depth).any(|a| filter_fn(&a))
}

pub(crate) fn text_density(node: &NodeRef, selector: &str, char_count: Option<usize>) -> f32 {
    let sel = Selection::from(*node).select(selector);
    let sel_nodes = sel.nodes();

    let children_length: f32 = sel_nodes.iter().map(inner_text_length).sum::<usize>() as f32;

    if children_length == 0.0 {
        return 0.0;
    }
    let text_length = char_count.unwrap_or_else(|| inner_text_length(node)) as f32;

    if text_length == 0.0 {
        return 0.0;
    }
    children_length / text_length
}

pub(crate) fn normalize_spaces(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut iter = text.split_whitespace();

    if let Some(first) = iter.next() {
        result.push_str(first);
        for word in iter {
            result.push(' ');
            result.push_str(word);
        }
    }
    result
}

pub(crate) fn link_density_fn<F>(node: &NodeRef, char_count: Option<usize>, mut count_fn: F) -> f32
where
    F: FnMut(&NodeRef) -> usize,
{
    let mut link_length = 0f32;

    for a in node.find_descendants("a") {
        let href = a.attr_or("href", "");
        let coeff = if href.len() > 1 && href.starts_with('#') {
            0.3
        } else {
            1.0
        };
        link_length += count_fn(&a) as f32 * coeff;
    }

    if link_length == 0.0 {
        return 0.0;
    }

    let text_length = char_count.unwrap_or_else(|| count_fn(node)) as f32;
    if text_length == 0.0 {
        return 0.0;
    }

    link_length / text_length
}

pub(crate) fn link_density(node: &NodeRef, char_count: Option<usize>) -> f32 {
    link_density_fn(node, char_count, inner_text_length)
}

/// Returns the child element if the node contains exactly one element child with the given tag
/// and no non-empty text nodes.
pub(crate) fn single_child_element<'a>(node: &NodeRef<'a>, tag: &str) -> Option<NodeRef<'a>> {
    // There should be exactly 1 element child with given tag
    let children = node.element_children();
    if children.len() != 1 {
        return None;
    }

    let first = children.first()?;

    if !first.has_name(tag) {
        return None;
    }
    if node.children_it(false).any(|n| n.is_nonempty_text()) {
        return None;
    }
    Some(*first)
}

pub(crate) fn is_element_without_content(node: &NodeRef) -> bool {
    // since this function calls only for elements check `node.is_element()` is redundant
    let has_text = node.descendants_it().any(|n| n.is_nonempty_text());
    if has_text {
        return false;
    }

    let el_children_count = node.children_it(false).filter(|n| n.is_element()).count();
    if el_children_count == 0 {
        return true;
    }

    let line_breaks = node.find_descendants("br").len() + node.find_descendants("hr").len();
    el_children_count == line_breaks
}

pub(crate) fn get_dir_attr(node: &NodeRef) -> Option<String> {
    if let Some(first_child) = node.first_child() {
        if let Some(dir_attr) = first_child.attr("dir") {
            return Some(dir_attr.to_string());
        }

        let dir_attr = first_child.ancestors_it(None).find_map(|a| a.attr("dir"));
        if let Some(dir_attr) = dir_attr {
            return Some(dir_attr.to_string());
        }
    }
    None
}

pub(crate) fn node_name_in(node: &NodeRef, names: &phf::Set<&str>) -> bool {
    node.qual_name_ref()
        .is_some_and(|name| names.contains(name.local.as_ref()))
}

pub(crate) fn is_probably_visible(node: &NodeRef) -> bool {
    if node.has_attr("hidden") {
        return false;
    }
    if is_invisible_style(node) {
        return false;
    }
    !MINI_ARIA_HIDDEN.match_node(node) || MINI_FALLBACK_IMG.match_node(node)
}

pub(crate) fn get_node_matching_string(node: &NodeRef) -> StrTendril {
    let mut buf = StrTendril::new();
    let Some(el) = node.element_ref() else {
        return buf;
    };

    for attr in &el.attrs {
        if !matches!(attr.name.local.as_ref(), "class" | "id") {
            continue;
        }
        buf.push_tendril(&attr.value);
        buf.push_char(' ');
    }

    buf.make_ascii_lowercase();
    buf
}

pub(crate) fn next_child_or_sibling<'a>(
    node: &NodeRef<'a>,
    ignore_child: bool,
) -> Option<NodeRef<'a>> {
    if !ignore_child {
        if let Some(first_child) = node.first_element_child() {
            return Some(first_child);
        }
    }

    if let Some(sibling) = node.next_element_sibling() {
        return Some(sibling);
    }
    let mut parent = node.parent();
    while let Some(parent_node) = parent {
        if let Some(next_sibling) = parent_node.next_element_sibling() {
            return Some(next_sibling);
        }
        parent = parent_node.parent();
    }
    None
}

#[cfg(not(feature = "aho-corasick"))]
/// A lightweight byte-level pre-checker used to quickly skip patterns
/// that cannot occur in the haystack.
pub(crate) struct BytePatternCheck<'a> {
    haystack: &'a str,
    char_map: [u8; 256],
}

#[cfg(not(feature = "aho-corasick"))]
impl<'a> BytePatternCheck<'a> {
    pub(crate) fn new(haystack: &'a str) -> Self {
        let mut char_map = [0u8; 256];

        for &b in haystack.as_bytes() {
            char_map[b as usize] = 1;
        }
        Self { haystack, char_map }
    }
    #[inline]
    fn pre_check(&self, pat: &str) -> bool {
        for &b in pat.as_bytes() {
            if self.char_map[b as usize] == 0 {
                return false;
            }
        }
        true
    }
    /// Checks if the haystack contains any of the given patterns.
    /// Performs a cheap bitmap pre-check before `str::contains`.
    pub(crate) fn contains_any(&self, pats: &[&str]) -> bool {
        pats.iter()
            .any(|pat| self.pre_check(pat) && self.haystack.contains(pat))
    }
}

#[derive(Default)]
pub(crate) struct CharCounterCache {
    inner: HashMap<NodeId, usize>,
}

impl CharCounterCache {
    pub(crate) fn char_count(&mut self, node: &NodeRef) -> usize {
        *self
            .inner
            .entry(node.id)
            .or_insert_with(|| inner_text_length(node))
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    const FLOAT_TOLERANCE: f64 = 0.00001;

    #[test]
    fn inner_text_length_uses_js_whitespace_and_utf16() {
        let doc = dom_query::Document::from("<p>\u{feff}  😀\t\nword \u{0085} </p>");
        let sel = doc.select_single("p");
        // BOM is trim whitespace; NEL is an ordinary character in JavaScript.
        assert_eq!(inner_text_length(sel.nodes().first().unwrap()), 9);
    }

    #[test]
    fn text_similarity_uses_ascii_tokens_and_joined_spaces() {
        assert_eq!(text_similarity("你好", "你好"), 0.0);
        assert_eq!(text_similarity("alpha", "alpha beta"), 0.6);
        assert_eq!(text_similarity("alphabet", "alpha"), 0.0);
    }

    #[test]
    fn test_text_similarity() {
        let text_a = "The quick brown fox";
        let text_b = "The quick fox";
        let similarity = text_similarity(text_a, text_b);
        assert!(similarity > 0.75);
    }

    #[test]
    fn test_text_similarity_contains() {
        let text_a = "the quick brown fox jumps over the lazy dog";
        let text_b = "The Quick Brown Fox";
        let similarity = text_similarity(text_a, text_b);
        assert!(1.0 - similarity < FLOAT_TOLERANCE);
    }

    #[test]
    fn test_text_similarity_similar() {
        let text_a = "DeepMind新电脑已可利用记忆自学 人工智能迈上新台阶_科技_腾讯网";
        let text_b = "DeepMind新电脑已可利用记忆自学 人工智能迈上新台阶";
        let similarity = text_similarity(text_a, text_b);
        assert!(1.0 - similarity < FLOAT_TOLERANCE);
    }

    #[test]
    fn test_normalize_spaces() {
        let text = "    The quick  brown  fox\n jumps over the lazy dog. ";
        let normalized_text = normalize_spaces(text);
        let expected = "The quick brown fox jumps over the lazy dog.";
        assert_eq!(expected, normalized_text);
    }

    #[test]
    #[cfg(not(feature = "aho-corasick"))]
    fn test_ascii_pattern_check() {
        let class = "article primary main äußerlich konnen";
        let check = BytePatternCheck::new(class);
        assert!(check.contains_any(&["äußerlich"]));
        assert!(check.contains_any(&["article", "post"]));
        assert!(!check.contains_any(&["können"]));
    }
}
