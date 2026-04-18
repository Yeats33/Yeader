//! Reader orchestration will live here.

pub mod pipeline;
pub mod txt;

use yeader_models::ReadingProgress;

pub use pipeline::{BookInfo, Chapter, fetch_book_info, fetch_toc, fetch_content};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReaderSession {
    pub progress: ReadingProgress,
}
