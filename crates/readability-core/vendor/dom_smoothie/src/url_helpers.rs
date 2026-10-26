use std::borrow::Cow;

fn delimiter(s: &str) -> &str {
    let mut count = 0;
    for (i, c) in s.char_indices() {
        if c == ':' || c == '/' {
            count = i + c.len_utf8();
            if count >= 3 {
                break;
            }
        } else {
            break;
        }
    }
    &s[..count]
}

/// Checks whether the string is an absolute URL.
///
/// - If `strict` is `true`, requires the scheme to be followed by `://`
///   (e.g. `http://`, `https://`, `ftp://`).
/// - If `strict` is `false`, accepts any scheme followed by `:`
///   (e.g. `mailto:`, `data:`, `blob:`).
pub(crate) fn is_absolute_url(s: &str, strict: bool) -> bool {
    let s = s.trim();
    let delim = if strict { "://" } else { ":" };
    if let Some(pos) = s.find(delim) {
        let scheme = &s[..pos];
        let mut chars = scheme.chars();
        if let Some(first) = chars.next() {
            if first.is_ascii_alphabetic()
                && chars.all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c))
            {
                if strict {
                    return s.len() > pos + delim.len() && !s.ends_with(delim);
                }
                return s.len() > pos + delimiter(&s[pos..]).len();
            }
        }
    }
    false
}

pub(crate) fn to_absolute_url<'a>(base: &'a str, relative: &'a str) -> Cow<'a, str> {
    if relative.starts_with("file://") {
        // this url is absolute
        relative.replacen("|/", ":/", 1).into()
    } else {
        resolve_url(base, relative)
    }
}

/// Resolves a relative or absolute URL against a given base URL.
pub(crate) fn resolve_url<'a>(base: &'a str, relative: &'a str) -> Cow<'a, str> {
    match url::Url::parse(base).and_then(|base_url| base_url.join(relative)) {
        Ok(url) => Cow::Owned(url.to_string()),
        Err(_) => Cow::Borrowed(relative),
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_valid_urls() {
        assert!(is_absolute_url("http://example.com", true));
        assert!(is_absolute_url("https://example.com", true));
        assert!(is_absolute_url("git+ssh://example.com", true));
        assert!(is_absolute_url("a-b://x", true));
        assert!(is_absolute_url("x.y://zzz", true));
        assert!(is_absolute_url("mailto:foo@bar.com", false));
        assert!(is_absolute_url("file:///C:/report.html", true));
    }

    #[test]
    fn test_invalid_urls() {
        assert!(!is_absolute_url("://example.com", true));
        assert!(!is_absolute_url("example.com", true));
        assert!(!is_absolute_url("example.com", false));
        assert!(!is_absolute_url("1http://example.com", true));
        assert!(!is_absolute_url("-abc://test", true));
        assert!(!is_absolute_url("   ", true));
        assert!(!is_absolute_url("   ", false));
        assert!(!is_absolute_url("mailto:foo@bar.com", true));
        assert!(!is_absolute_url("https://", true));
        assert!(!is_absolute_url("http://", false));
        assert!(!is_absolute_url("mailto:", false));
    }

    #[test]
    fn test_url_join() {
        let tests = [
            // (base, relative, expected)
            ("example.com", "image.jpg", "image.jpg"),
            ("http://example.com/path/page.html", "image.jpg", "http://example.com/path/image.jpg"),
            ("http://example.com/path/page.html", "/image.jpg", "http://example.com/image.jpg"),

            ("http://fakehost/test", 
            "/syndication/reuse-permision-form?url=http://www.independent.co.uk/news/business/news/seven-secrets-that-hotel-owners-dont-want-you-to-know-10506160.html", 
            "http://fakehost/syndication/reuse-permision-form?url=http://www.independent.co.uk/news/business/news/seven-secrets-that-hotel-owners-dont-want-you-to-know-10506160.html"),

            ("http://fakehost/test",
            "//img-aws.ehowcdn.com/cdn-write.demandstudios.com/upload/image/2F/86/0496F61C862F.jpg", 
            "http://img-aws.ehowcdn.com/cdn-write.demandstudios.com/upload/image/2F/86/0496F61C862F.jpg"),

            ("http://example.com/path/page.html", "blob:http://www.independent.co.uk/112e1cb2-b0b1-e146-be22-fc6d052f7ddd", 
            "blob:http://www.independent.co.uk/112e1cb2-b0b1-e146-be22-fc6d052f7ddd"),
            ("http://fakehost/test/", "./W020170310313653868929.jpg", "http://fakehost/test/W020170310313653868929.jpg"),
            ("http://fakehost/test/", "../../../../366/logo_bana/corner_2.gif", "http://fakehost/366/logo_bana/corner_2.gif"),
            ("http://fakehost/", "../../../../366/logo_bana/corner_2.gif", "http://fakehost/366/logo_bana/corner_2.gif"),
            ("http://example.com/path/page.html", "foo//bar", "http://example.com/path/foo//bar"),
            ("http://example.com/", "data:text/plain,hello", "data:text/plain,hello"),
            ("http://example.com/", "../foo", "http://example.com/foo"),
            ("http://example.com/path/page.html", "", "http://example.com/path/page.html"),
            ("http://example.com/path/page.html", "https://other.com/file", "https://other.com/file"),
            ("http://example.com/path/page.html", "?id=123", "http://example.com/path/page.html?id=123"),
            ("https://example.com/page?query=1#old", "#new", "https://example.com/page?query=1#new"),
            ("https://example.com/a/", "中文 path", "https://example.com/a/%E4%B8%AD%E6%96%87%20path"),
            // WHATWG-compatible host normalization (local adaptation)
            ("https://café.com", "menu.html", "https://xn--caf-dma.com/menu.html"),

            ("http://example.com/path/page.html",
            "#comments",
            "http://example.com/path/page.html#comments",
            ),

            ("http://example.com/path/page.html?a=1#top",
            "?b=2",
            "http://example.com/path/page.html?b=2",
            ),
        ];

        for (base, relative, expected) in tests {
            let result = resolve_url(base, relative);
            assert_eq!(
                result, expected,
                "Failed for base: {base}, relative: {relative}",
            );
        }
    }
}
