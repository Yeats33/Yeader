use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Capabilities {
    pub feed: bool,
    pub search: bool,
    pub content: bool,
    pub toc: bool,
    pub asset: bool,
    pub login: bool,
    pub offline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PluginKind {
    Functional,
    Source,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PluginRuntimeKind {
    Native,
    Wasm,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginMetaInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub sdk_version: u32,
    pub description: String,
    pub kind: PluginKind,
    pub runtime: PluginRuntimeKind,
    pub capabilities: Capabilities,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SearchSort {
    Latest,
    Popular,
    Relevance,
}

impl Default for SearchSort {
    fn default() -> Self {
        SearchSort::Latest
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchQuery {
    pub keyword: String,
    pub page: u32,
    pub sort: SearchSort,
}

impl SearchQuery {
    pub fn new(keyword: impl Into<String>) -> Self {
        Self {
            keyword: keyword.into(),
            page: 1,
            sort: SearchSort::default(),
        }
    }
}

/// Listing/preview entry from a search result.
///
/// Source plugins map their site-specific search response into this normalized form.
/// `content_id` is the opaque id used to fetch the full `ContentDetail` later.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchHit {
    pub content_id: String,
    pub source: String,
    pub title: String,
    pub author: String,
    pub cover_url: String,
    pub tags: Vec<String>,
    pub extra: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub current_page: u32,
    pub total_pages: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContentDetail {
    pub content_id: String,
    pub source: String,
    pub title: String,
    pub author: String,
    pub cover_url: String,
    pub description: String,
    pub tags: Vec<String>,
    pub chapters: Vec<ChapterInfo>,
    pub extra: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChapterInfo {
    pub id: String,
    pub title: String,
    pub page_count: Option<u32>,
}

/// A single fetchable asset (image, audio clip, …).
///
/// `headers` carries plugin-private metadata that the host echoes back into
/// `SourcePlugin::download_post`. JM uses this to pass scramble parameters
/// without leaking them into the public API.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetUrl {
    pub url: String,
    pub headers: HashMap<String, String>,
    pub index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessedAsset {
    pub bytes: Vec<u8>,
    pub extension: String,
    pub mime: Option<String>,
}

impl ProcessedAsset {
    pub fn passthrough(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            extension: String::new(),
            mime: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Session {
    pub token: String,
    pub username: String,
    pub extra: HashMap<String, String>,
}
