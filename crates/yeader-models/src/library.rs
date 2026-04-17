use serde::{Deserialize, Serialize};

pub type BookId = String;

/// A persisted bookshelf entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BookshelfEntry {
    pub id: BookId,
    pub title: String,
    pub author: String,
    pub source_id: String,
}

/// A persisted reading position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub book_id: BookId,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub offset: usize,
}
