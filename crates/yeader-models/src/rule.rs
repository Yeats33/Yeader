//! Rule structures matching legado's SearchRule / BookInfoRule / TocRule / ContentRule.

use serde::{Deserialize, Serialize};

/// Search result extraction rules.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub book_url: Option<String>,
    pub cover_url: Option<String>,
    pub word_count: Option<String>,
    pub check_key_word: Option<String>,
}

/// Book detail page extraction rules.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    pub init: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub word_count: Option<String>,
    pub can_re_name: Option<String>,
    pub download_urls: Option<String>,
}

/// Table-of-contents / chapter-list extraction rules.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    pub chapter_list: Option<String>,
    pub chapter_name: Option<String>,
    pub chapter_url: Option<String>,
    pub format_js: Option<String>,
    pub is_volume: Option<String>,
    pub is_vip: Option<String>,
    pub is_pay: Option<String>,
    pub update_time: Option<String>,
    pub next_toc_url: Option<String>,
    pub pre_update_js: Option<String>,
}

/// Chapter content extraction rules.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    pub content: Option<String>,
    pub title: Option<String>,
    pub next_content_url: Option<String>,
    pub web_js: Option<String>,
    pub source_regex: Option<String>,
    pub replace_regex: Option<String>,
    pub image_style: Option<String>,
    pub image_decode: Option<String>,
    pub pay_action: Option<String>,
}
