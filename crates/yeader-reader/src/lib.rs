//! Reader orchestration will live here.

pub mod pipeline;
pub mod txt;

use yeader_models::ReadingProgress;

pub use pipeline::{fetch_book_info, fetch_content, fetch_toc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReaderSession {
    pub progress: ReadingProgress,
}
