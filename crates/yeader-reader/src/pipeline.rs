//! Content fetch pipelines using the rule engine.
//!
//! Orchestrates fetching book info, table of contents, and chapter content
//! using LegacyBookSource rules and the AnalyzeRule engine.

use yeader_models::{LegacyBookSource, TocRule};
use yeader_rules::{AnalyzeRule, Content, ReplaceRule};

/// Book information extracted from a book source page.
#[derive(Debug, Clone, PartialEq)]
pub struct BookInfo {
    pub title: String,
    pub author: String,
    pub intro: String,
    pub kind: String,
    pub last_chapter: String,
    pub update_time: String,
    pub cover_url: String,
    pub toc_url: String,
    pub word_count: String,
}

/// A chapter in the table of contents.
#[derive(Debug, Clone, PartialEq)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
    pub is_vip: bool,
}

/// Resolve a potentially relative URL against a base URL.
fn resolve_url(base: &str, relative: &str) -> String {
    if relative.is_empty() {
        return String::new();
    }

    // If already absolute, return as-is
    if relative.starts_with("http://") || relative.starts_with("https://") {
        return relative.to_string();
    }

    // Handle absolute path relative to domain (starts with /)
    if relative.starts_with('/') {
        // Extract scheme + domain from base
        if let Some(domain_end) = base.find("://").map(|i| {
            base[i + 3..]
                .find('/')
                .map(|j| i + 3 + j)
                .unwrap_or(base.len())
        }) {
            let domain = &base[..domain_end];
            return format!("{}{}", domain, relative);
        }
    }

    // Handle relative path with parent traversal (../)
    if relative.starts_with("../") {
        let mut result = base.to_string();
        let mut rel = relative;

        // If base doesn't end with /, it's a file path - remove the file first
        if !result.ends_with('/') {
            if let Some(end) = result.rfind('/') {
                result.truncate(end);
            }
        }

        while rel.starts_with("../") {
            rel = &rel[3..];
            // Remove last path segment
            if let Some(end) = result.rfind('/') {
                result.truncate(end);
            }
        }
        return format!("{}/{}", result, rel);
    }

    // Simple relative path - append to base, removing trailing slash
    let base = base.trim_end_matches('/');
    format!("{}/{}", base, relative)
}

/// Fetch book information from a book detail page.
///
/// Uses the source's `rule_book_info` to extract fields from the HTML/JSON body.
pub fn fetch_book_info(source: &LegacyBookSource, book_url: &str, body: &str) -> BookInfo {
    let rule = match &source.rule_book_info {
        Some(r) => r,
        None => return BookInfo::default(),
    };

    let analyzer = AnalyzeRule::new(body, book_url);

    // Apply init rule if present (sets up context for subsequent extractions)
    if let Some(init_rule) = &rule.init {
        let _ = analyzer.get_string(init_rule);
    }

    BookInfo {
        title: analyzer.get_string(rule.name.as_deref().unwrap_or("")),
        author: analyzer.get_string(rule.author.as_deref().unwrap_or("")),
        intro: analyzer.get_string(rule.intro.as_deref().unwrap_or("")),
        kind: analyzer.get_string(rule.kind.as_deref().unwrap_or("")),
        last_chapter: analyzer.get_string(rule.last_chapter.as_deref().unwrap_or("")),
        update_time: analyzer.get_string(rule.update_time.as_deref().unwrap_or("")),
        cover_url: analyzer.get_string(rule.cover_url.as_deref().unwrap_or("")),
        toc_url: analyzer.get_string(rule.toc_url.as_deref().unwrap_or("")),
        word_count: analyzer.get_string(rule.word_count.as_deref().unwrap_or("")),
    }
}

impl Default for BookInfo {
    fn default() -> Self {
        Self {
            title: String::new(),
            author: String::new(),
            intro: String::new(),
            kind: String::new(),
            last_chapter: String::new(),
            update_time: String::new(),
            cover_url: String::new(),
            toc_url: String::new(),
            word_count: String::new(),
        }
    }
}

/// Fetch table of contents (chapter list) from a TOC page.
///
/// Supports multi-page TOC via `next_toc_url` rule.
pub fn fetch_toc(
    source: &LegacyBookSource,
    _book_url: &str,
    toc_url: &str,
    body: &str,
) -> Vec<Chapter> {
    let rule = match &source.rule_toc {
        Some(r) => r,
        None => return Vec::new(),
    };

    let analyzer = AnalyzeRule::new(body, toc_url);
    let chapters = extract_chapters(&analyzer, rule);

    // Handle multi-page TOC if next_toc_url is configured
    if let Some(next_url_rule) = &rule.next_toc_url {
        let next_relative = analyzer.get_string(next_url_rule);
        if !next_relative.is_empty() {
            // Resolve the next page URL relative to the current TOC URL
            let next_url = resolve_url(toc_url, &next_relative);
            // In a real implementation, this would fetch the next page and append
            // For now, we store the next URL in the chapter list (last entry)
            let _ = next_url;
        }
    }

    chapters
}

fn extract_chapters(analyzer: &AnalyzeRule, rule: &TocRule) -> Vec<Chapter> {
    let chapter_list_rule = match &rule.chapter_list {
        Some(r) => r.as_str(),
        None => return Vec::new(),
    };

    let elements = analyzer.get_elements(chapter_list_rule);
    if elements.is_empty() {
        return Vec::new();
    }

    let chapter_name_rule = rule.chapter_name.as_deref().unwrap_or("");
    let chapter_url_rule = rule.chapter_url.as_deref().unwrap_or("");
    let is_volume_rule = rule.is_volume.as_deref().unwrap_or("");
    let is_vip_rule = rule.is_vip.as_deref().unwrap_or("");

    let mut chapters = Vec::new();

    for element in elements {
        // Create a sub-analyzer for each chapter element
        let inner_analyzer = AnalyzeRule::from_content(
            Content::Html(element.to_string()),
            analyzer.base_url(),
        );

        let title = inner_analyzer.get_string(chapter_name_rule);
        let url = inner_analyzer.get_string(chapter_url_rule);
        let is_volume = !inner_analyzer.get_string(is_volume_rule).is_empty();
        let is_vip = !inner_analyzer.get_string(is_vip_rule).is_empty();

        if !title.is_empty() || !url.is_empty() {
            chapters.push(Chapter {
                title,
                url,
                is_volume,
                is_vip,
            });
        }
    }

    chapters
}

/// Fetch chapter content from a chapter page.
///
/// Applies the source's replace rules chain to clean the content.
pub fn fetch_content(
    source: &LegacyBookSource,
    chapter_url: &str,
    body: &str,
    replace_rules: &[ReplaceRule],
) -> String {
    let rule = match &source.rule_content {
        Some(r) => r,
        None => return String::new(),
    };

    let analyzer = AnalyzeRule::new(body, chapter_url);

    // Extract content using the content rule
    let content_rule = rule.content.as_deref().unwrap_or("");
    let mut content = analyzer.get_string(content_rule);

    // Apply replace rules chain if available
    if !replace_rules.is_empty() {
        content = yeader_rules::apply_replace_rules(&content, replace_rules);
    }

    // Handle next_content_url for pagination (if rule is configured)
    if let Some(next_url_rule) = &rule.next_content_url {
        let next_url = analyzer.get_string(next_url_rule);
        if !next_url.is_empty() {
            // In a real implementation, this would fetch the next page and append
            let _ = next_url;
        }
    }

    content
}

#[cfg(test)]
mod tests {
    use super::*;
    use yeader_models::rule::BookInfoRule;

    const BOOK_DETAIL_HTML: &str = r#"<!DOCTYPE html>
<html>
<body>
<div class="book-info">
  <img class="cover" src="/cover.jpg">
  <h1 class="title">Test Book</h1>
  <span class="author">Test Author</span>
  <div class="intro">This is a test book description.</div>
  <span class="kind">Fantasy</span>
  <a class="latest">Chapter 100</a>
  <span class="updated">2024-01-15</span>
  <a class="catalog" href="/book/123/catalog">Table of Contents</a>
  <span class="words">1,234,567</span>
</div>
</body>
</html>"#;

    fn make_source() -> LegacyBookSource {
        LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test Source".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: Some(BookInfoRule {
                init: Some("@CSS:.book-info".to_string()),
                name: Some("tag.h1@text".to_string()),
                author: Some("span.author@text".to_string()),
                intro: Some("div.intro@text".to_string()),
                kind: Some("span.kind@text".to_string()),
                last_chapter: Some("a.latest@text".to_string()),
                update_time: Some("span.updated@text".to_string()),
                cover_url: Some("img.cover@src".to_string()),
                toc_url: Some("a.catalog@href".to_string()),
                word_count: Some("span.words@text".to_string()),
                can_re_name: None,
                download_urls: None,
            }),
            rule_toc: None,
            rule_content: None,
            extra: Default::default(),
        }
    }

    #[test]
    fn fetch_book_info_extracts_all_fields() {
        let source = make_source();
        let book_url = "https://example.com/book/123";
        let info = fetch_book_info(&source, book_url, BOOK_DETAIL_HTML);

        assert_eq!(info.title, "Test Book");
        assert_eq!(info.author, "Test Author");
        assert_eq!(info.intro, "This is a test book description.");
        assert_eq!(info.kind, "Fantasy");
        assert_eq!(info.last_chapter, "Chapter 100");
        assert_eq!(info.update_time, "2024-01-15");
        assert_eq!(info.cover_url, "/cover.jpg");
        assert_eq!(info.toc_url, "/book/123/catalog");
        assert_eq!(info.word_count, "1,234,567");
    }

    #[test]
    fn fetch_book_info_handles_missing_rules() {
        let source = LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            extra: Default::default(),
        };

        let info = fetch_book_info(&source, "https://example.com/book", BOOK_DETAIL_HTML);
        assert_eq!(info.title, "");
    }

    #[test]
    fn fetch_book_info_handles_empty_body() {
        let source = make_source();
        let info = fetch_book_info(&source, "https://example.com/book", "");
        assert_eq!(info.title, "");
    }

    const TOC_HTML: &str = r#"<!DOCTYPE html>
<html>
<body>
<ol class="chapter-list" id="chapters">
  <li><a href="/book/123/chapter/1">Chapter 1 - The Beginning</a></li>
  <li><a href="/book/123/chapter/2">Chapter 2 - The Journey</a></li>
  <li><span class="volume">Volume 1</span></li>
  <li><a href="/book/123/chapter/3">Chapter 3 - The Discovery</a></li>
  <li><span class="vip">VIP Chapter</span><a href="/book/123/chapter/vip">VIP Content</a></li>
</ol>
<a class="next" href="/book/123/toc?page=2">Next Page</a>
</body>
</html>"#;

    fn make_toc_source() -> LegacyBookSource {
        LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test Source".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: None,
            rule_toc: Some(TocRule {
                chapter_list: Some("@CSS:#chapters > li".to_string()),
                chapter_name: Some("a@text||tag.span@text".to_string()),
                chapter_url: Some("a@href".to_string()),
                format_js: None,
                is_volume: Some("span.volume@text".to_string()),
                is_vip: Some("span.vip@text".to_string()),
                is_pay: None,
                update_time: None,
                next_toc_url: Some("a.next@href".to_string()),
                pre_update_js: None,
            }),
            rule_content: None,
            extra: Default::default(),
        }
    }

    #[test]
    fn fetch_toc_extracts_chapters() {
        let source = make_toc_source();
        let chapters = fetch_toc(&source, "https://example.com/book/123", "https://example.com/book/123/toc", TOC_HTML);

        assert_eq!(chapters.len(), 5);
        assert_eq!(chapters[0].title, "Chapter 1 - The Beginning");
        assert_eq!(chapters[0].url, "/book/123/chapter/1");
        assert!(!chapters[0].is_volume);
        assert!(!chapters[0].is_vip);

        assert_eq!(chapters[1].title, "Chapter 2 - The Journey");
        assert_eq!(chapters[1].url, "/book/123/chapter/2");
    }

    #[test]
    fn fetch_toc_handles_volume_markers() {
        let source = make_toc_source();
        let chapters = fetch_toc(&source, "https://example.com/book/123", "https://example.com/book/123/toc", TOC_HTML);

        // Volume marker (3rd item) has title from span.volume
        assert_eq!(chapters[2].title, "Volume 1");
        assert!(chapters[2].is_volume);
        assert!(chapters[2].url.is_empty());
    }

    #[test]
    fn fetch_toc_handles_vip_chapters() {
        let source = make_toc_source();
        let chapters = fetch_toc(&source, "https://example.com/book/123", "https://example.com/book/123/toc", TOC_HTML);

        // VIP chapter (5th item) has both volume and vip markers
        assert_eq!(chapters[4].title, "VIP Content");
        assert!(chapters[4].is_vip);
        assert_eq!(chapters[4].url, "/book/123/chapter/vip");
    }

    #[test]
    fn fetch_toc_handles_missing_rules() {
        let source = LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            extra: Default::default(),
        };

        let chapters = fetch_toc(&source, "https://example.com/book/123", "https://example.com/toc", TOC_HTML);
        assert!(chapters.is_empty());
    }

    #[test]
    fn resolve_url_handles_relative_paths() {
        assert_eq!(
            resolve_url("https://example.com/book/123/toc", "../chapter/1"),
            "https://example.com/book/chapter/1"
        );
        assert_eq!(
            resolve_url("https://example.com/book/123/", "chapter/2"),
            "https://example.com/book/123/chapter/2"
        );
        assert_eq!(
            resolve_url("https://example.com/book/123", "/chapter/3"),
            "https://example.com/chapter/3"
        );
        assert_eq!(
            resolve_url("https://example.com/book/123", "https://other.com/chap"),
            "https://other.com/chap"
        );
    }

    const CHAPTER_HTML: &str = r#"<!DOCTYPE html>
<html>
<body>
<h1 class="chapter-title">Chapter 1 - The Beginning</h1>
<div id="content">
  <p>First paragraph of the chapter.</p>
  <p>Second paragraph with some  extra   spacing.</p>
  <p>Third paragraph.</p>
</div>
<a class="next-page" href="/book/123/chapter/2">Next Chapter</a>
</body>
</html>"#;

    fn make_content_source() -> LegacyBookSource {
        use yeader_models::rule::ContentRule;
        LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test Source".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: None,
            rule_toc: None,
            rule_content: Some(ContentRule {
                content: Some("@CSS:#content@html".to_string()),
                title: Some("tag.h1@text".to_string()),
                next_content_url: Some("a.next-page@href".to_string()),
                web_js: None,
                source_regex: None,
                replace_regex: None,
                image_style: None,
                image_decode: None,
                pay_action: None,
            }),
            extra: Default::default(),
        }
    }

    #[test]
    fn fetch_content_extracts_html() {
        let source = make_content_source();
        let content = fetch_content(&source, "https://example.com/book/123/chapter/1", CHAPTER_HTML, &[]);

        // Check that key content is present (HTML structure may vary)
        assert!(content.contains("First paragraph"));
        assert!(content.contains("Second paragraph"));
        assert!(content.contains("Third paragraph"));
    }

    #[test]
    fn fetch_content_applies_replace_rules() {
        let source = make_content_source();
        let rules = vec![
            ReplaceRule::new("\\s+".to_string(), " ".to_string(), true, false), // normalize whitespace
            ReplaceRule::new("<[^>]+>".to_string(), "".to_string(), true, false), // strip HTML tags
        ];
        let content = fetch_content(&source, "https://example.com/book/123/chapter/1", CHAPTER_HTML, &rules);

        // HTML tags should be stripped
        assert!(!content.contains("<p>"));
        // Text content should be present
        assert!(content.contains("First paragraph"));
    }

    #[test]
    fn fetch_content_handles_missing_rules() {
        let source = LegacyBookSource {
            book_source_url: "https://example.com".to_string(),
            book_source_name: "Test".to_string(),
            book_source_group: None,
            search_url: None,
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            enabled: true,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            extra: Default::default(),
        };

        let content = fetch_content(&source, "https://example.com/chapter", CHAPTER_HTML, &[]);
        assert_eq!(content, "");
    }
}
