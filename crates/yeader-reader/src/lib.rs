//! Reader orchestration will live here.

use yeader_models::ReadingProgress;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReaderSession {
    pub progress: ReadingProgress,
}
