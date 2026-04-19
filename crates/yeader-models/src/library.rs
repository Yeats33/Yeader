use serde::{Deserialize, Serialize};
use serde_json::Map;

pub type BookId = String;

/// A persisted reading position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub book_id: BookId,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub offset: usize,
}

// ---------------------------------------------------------------------------
// Book / BookGroup / Bookmark — full bookshelf schema
// ---------------------------------------------------------------------------

/// A book on the user's bookshelf.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Book {
    /// Primary key — book detail URL.
    pub url: String,
    pub name: String,
    pub author: String,
    #[serde(default)]
    pub cover_url: Option<String>,
    /// Book source URL this book was discovered from.
    pub source_url: String,
    #[serde(default)]
    pub toc_url: Option<String>,
    /// ISO-8601 timestamp of last read.
    #[serde(default)]
    pub last_read_at: Option<String>,
    /// FK into book_groups.id.
    #[serde(default)]
    pub group_id: Option<i64>,
    /// Book type label (e.g. "novel", "comic").
    #[serde(default)]
    pub book_type: Option<String>,
    /// Book introduction / description.
    #[serde(default)]
    pub intro: Option<String>,
    /// Arbitrary extra fields serialised as JSON.
    #[serde(default)]
    pub extra: Map<String, serde_json::Value>,
}

/// A user-defined book group / shelf.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BookGroup {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
}

/// A user-created bookmark within a book.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: i64,
    pub book_url: String,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub offset: usize,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Reader pipeline types
// ---------------------------------------------------------------------------

/// Book metadata fetched from a book source.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookInfo {
    pub name: String,
    pub author: String,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

/// A single chapter in a book's table of contents.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
    pub is_vip: bool,
    pub is_pay: bool,
}
