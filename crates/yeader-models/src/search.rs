use serde::{Deserialize, Serialize};

/// A source-scoped search request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchQuery {
    pub source_id: String,
    pub keyword: String,
}

/// A normalized search result emitted by the Rust core.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResult {
    pub source_id: String,
    pub title: String,
    pub author: String,
    pub detail_url: String,
}
