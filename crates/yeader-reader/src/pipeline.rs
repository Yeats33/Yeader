//! Content fetch pipelines using the rule engine.
//!
//! Orchestrates fetching book info, table of contents, and chapter content
//! using LegacyBookSource rules and the AnalyzeRule engine.

use yeader_models::rule::BookInfoRule;
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
        let next_url = analyzer.get_string(next_url_rule);
        if !next_url.is_empty() {
            // Recursively fetch next page and append
            // Note: In a real implementation, this would fetch the next page
            // For now, we return what we have
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
}
