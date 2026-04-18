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

/// Book entity representing a book in the library.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Book {
    pub id: BookId,
    pub title: String,
    pub author: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub toc_url: Option<String>,
    pub source_id: String,
    pub url: String,
}

/// Chapter entity representing a chapter in a book.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub book_id: BookId,
    pub index: usize,
    pub title: String,
    pub url: String,
    pub content: Option<String>,
}
