use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::rule::{BookInfoRule, ContentRule, SearchRule, TocRule};

/// Parse a Legado book source export payload.
pub fn parse_book_sources(json: &str) -> Result<Vec<LegacyBookSource>, serde_json::Error> {
    serde_json::from_str(json)
}

/// Parse a Legado RSS source export payload.
pub fn parse_rss_sources(json: &str) -> Result<Vec<LegacyRssSource>, serde_json::Error> {
    serde_json::from_str(json)
}

/// Parse a Legado replace-rule export payload.
pub fn parse_replace_rules(json: &str) -> Result<Vec<LegacyReplaceRule>, serde_json::Error> {
    serde_json::from_str(json)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyBookSource {
    pub book_source_url: String,
    pub book_source_name: String,
    #[serde(default)]
    pub book_source_group: Option<String>,
    #[serde(default)]
    pub search_url: Option<String>,
    #[serde(default)]
    pub book_url_pattern: Option<String>,
    #[serde(default)]
    pub login_check_js: Option<String>,
    #[serde(default)]
    pub book_source_type: Option<i32>,
    #[serde(default)]
    pub enabled_explore: Option<bool>,
    #[serde(default)]
    pub explore_url: Option<String>,
    #[serde(default)]
    pub rule_search: Option<SearchRule>,
    #[serde(default)]
    pub rule_book_info: Option<BookInfoRule>,
    #[serde(default)]
    pub rule_toc: Option<TocRule>,
    #[serde(default)]
    pub rule_content: Option<ContentRule>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub last_test_available: Option<bool>,
    #[serde(default)]
    pub last_tested_at: Option<String>,
    #[serde(default)]
    pub last_test_detail: Option<String>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyRssSource {
    pub source_url: String,
    pub source_name: String,
    pub source_icon: String,
    #[serde(default)]
    pub rule_articles: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyReplaceRule {
    pub id: i64,
    pub name: String,
    pub pattern: String,
    pub replacement: String,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

pub const LEGADO_BACKUP_FILES: &[&str] = &[
    "bookshelf.json",
    "bookmark.json",
    "bookGroup.json",
    "bookSource.json",
    "rssSources.json",
    "rssStar.json",
    "replaceRule.json",
    "readRecord.json",
    "searchHistory.json",
    "sourceSub.json",
    "txtTocRule.json",
    "httpTTS.json",
    "keyboardAssists.json",
    "dictRule.json",
    "servers.json",
    "directLinkUploadRule.json",
    "readConfig.json",
    "shareReadConfig.json",
    "themeConfig.json",
    "coverRule.json",
    "config.xml",
];

const fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::{LEGADO_BACKUP_FILES, parse_book_sources, parse_replace_rules, parse_rss_sources};

    const BOOK_SOURCE_FIXTURE: &str =
        include_str!("../../../fixtures/legado/sources/sample-book-source.json");
    const FULL_BOOK_SOURCE_FIXTURE: &str = r###"
[
  {
    "bookSourceUrl": "https://example.com/full-source",
    "bookSourceName": "Full Fixture Source",
    "bookSourceGroup": "Rules",
    "bookSourceType": 0,
    "bookUrlPattern": "https://example.com/book/\\d+",
    "enabled": true,
    "enabledExplore": true,
    "exploreUrl": "Latest::/explore/latest\nRank::/explore/rank",
    "searchUrl": "https://example.com/search?key={{key}}",
    "loginCheckJs": "document.cookie.includes('session=')",
    "ruleSearch": {
      "bookList": "@CSS:.result-list > li",
      "name": "a.title@text##\\s+## ",
      "author": "span.author@text",
      "intro": "p.desc@text",
      "kind": "span.kind@text",
      "lastChapter": "span.latest@text",
      "updateTime": "span.update@text",
      "bookUrl": "a.title@href",
      "coverUrl": "img.cover@src",
      "wordCount": "span.words@text##[^\\d万字]##",
      "checkKeyWord": "搜索"
    },
    "ruleBookInfo": {
      "init": "@CSS:.book-info",
      "name": "h1.title@text",
      "author": "span.author@text",
      "intro": "$.book.intro",
      "kind": "div.meta span.kind@text",
      "lastChapter": "a.latest@text",
      "updateTime": "span.updated@text",
      "coverUrl": "img.cover@src",
      "tocUrl": "a.catalog@href",
      "wordCount": "span.words@text##\\s+##",
      "canReName": "true",
      "downloadUrls": "$.downloads[*].url"
    },
    "ruleToc": {
      "chapterList": "@CSS:#chapters li",
      "chapterName": "a@text##^正文\\s*##",
      "chapterUrl": "a@href",
      "formatJs": "title.replace(/第(\\d+)章/, 'Chapter $1')",
      "isVolume": "span.volume@text",
      "isVip": "span.vip@text",
      "isPay": "span.paid@text",
      "updateTime": "span.time@text",
      "nextTocUrl": "a.next@href",
      "preUpdateJs": "java.put('page', java.get('page') + 1)"
    },
    "ruleContent": {
      "content": "@CSS:#content@html",
      "title": "h1.chapter-title@text",
      "nextContentUrl": "a.next-page@href",
      "webJs": "document.querySelector('.read-more')?.click(); 'ok';",
      "sourceRegex": "https://cdn\\.example\\.com/.*",
      "replaceRegex": "##广告.*$##",
      "imageStyle": "FULL",
      "imageDecode": "atob(result)",
      "payAction": "fetch('/unlock').then(() => 'ok')"
    },
    "customMetadata": "preserved"
  }
]
"###;
    const RSS_SOURCE_FIXTURE: &str =
        include_str!("../../../fixtures/legado/rss/sample-rss-source.json");
    const REPLACE_RULE_FIXTURE: &str =
        include_str!("../../../fixtures/legado/replace_rules/sample-replace-rule.json");

    #[test]
    fn parses_book_source_fixture_and_preserves_unknown_fields() {
        let sources = parse_book_sources(BOOK_SOURCE_FIXTURE).expect("book source fixture parses");
        let source = sources.first().expect("fixture contains one source");

        assert_eq!(source.book_source_url, "https://example.com/source");
        assert_eq!(source.book_source_name, "Fixture Source");
        assert_eq!(source.book_source_group.as_deref(), Some("Testing"));
        assert_eq!(
            source.search_url.as_deref(),
            Some("https://example.com/search?key={{key}}")
        );
        assert!(source.enabled);

        // ruleSearch is now a first-class field, not in extra
        assert!(source.rule_search.is_some());
        let rule_search = source.rule_search.as_ref().unwrap();
        assert_eq!(rule_search.book_list.as_deref(), Some("class.books@li"));
        assert_eq!(rule_search.name.as_deref(), Some("tag.a@text"));

        // Extra only keeps truly unknown fields
        assert_eq!(
            source.extra.get("customVariable"),
            Some(&Value::String("kept".to_string()))
        );
        assert!(!source.extra.contains_key("ruleSearch"));
    }

    #[test]
    fn parses_full_book_source_rule_fixture() {
        let sources =
            parse_book_sources(FULL_BOOK_SOURCE_FIXTURE).expect("full book source fixture parses");
        let source = sources.first().expect("fixture contains one source");

        assert_eq!(source.book_source_type, Some(0));
        assert_eq!(
            source.book_url_pattern.as_deref(),
            Some("https://example.com/book/\\d+")
        );
        assert_eq!(
            source
                .rule_book_info
                .as_ref()
                .and_then(|rule| rule.toc_url.as_deref()),
            Some("a.catalog@href")
        );
        assert_eq!(
            source
                .rule_toc
                .as_ref()
                .and_then(|rule| rule.chapter_name.as_deref()),
            Some("a@text##^正文\\s*##")
        );
        assert_eq!(
            source
                .rule_content
                .as_ref()
                .and_then(|rule| rule.content.as_deref()),
            Some("@CSS:#content@html")
        );
        assert_eq!(
            source.extra.get("customMetadata"),
            Some(&Value::String("preserved".to_string()))
        );
    }

    #[test]
    fn parses_rss_source_fixture_and_preserves_unknown_fields() {
        let sources = parse_rss_sources(RSS_SOURCE_FIXTURE).expect("rss fixture parses");
        let source = sources.first().expect("fixture contains one source");

        assert_eq!(source.source_url, "https://example.com/rss");
        assert_eq!(source.source_name, "Fixture RSS");
        assert_eq!(source.source_icon, "https://example.com/icon.png");
        assert_eq!(source.rule_articles.as_deref(), Some("class.list@article"));
        assert!(source.enabled);
        assert_eq!(
            source.extra.get("style"),
            Some(&Value::String(".article { color: red; }".to_string()))
        );
    }

    #[test]
    fn parses_replace_rule_fixture_and_preserves_unknown_fields() {
        let rules = parse_replace_rules(REPLACE_RULE_FIXTURE).expect("replace-rule fixture parses");
        let rule = rules.first().expect("fixture contains one rule");

        assert_eq!(rule.id, 42);
        assert_eq!(rule.name, "Trim Sponsor");
        assert_eq!(rule.pattern, "赞助商");
        assert_eq!(rule.replacement, "");
        assert!(rule.is_enabled);
        assert_eq!(
            rule.extra.get("timeoutMillisecond"),
            Some(&Value::Number(3000.into()))
        );
    }

    #[test]
    fn backup_file_set_matches_upstream_core_exports() {
        let expected = [
            "bookshelf.json",
            "bookmark.json",
            "bookGroup.json",
            "bookSource.json",
            "rssSources.json",
            "rssStar.json",
            "replaceRule.json",
            "readRecord.json",
            "searchHistory.json",
            "sourceSub.json",
            "txtTocRule.json",
            "httpTTS.json",
            "keyboardAssists.json",
            "dictRule.json",
            "servers.json",
            "directLinkUploadRule.json",
            "readConfig.json",
            "shareReadConfig.json",
            "themeConfig.json",
            "coverRule.json",
            "config.xml",
        ];

        assert_eq!(LEGADO_BACKUP_FILES, expected);
    }
}
