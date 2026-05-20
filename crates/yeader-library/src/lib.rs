//! Bookshelf and reading progress services backed by SQLite.

mod auth_repo;
mod db;
mod repo;
mod source_registry;

pub use auth_repo::{AuthRepo, AuthSession};
pub use db::Database;
pub use repo::{
    BookGroupRepo, BookRepo, BookSourceRepo, BookmarkRepo, ReadingProgressRepo, ReplaceRuleRepo,
    RssSourceRepo, YeaderSourceRepo,
};
pub use source_registry::{SourceKind, SourceRegistry, UnifiedSource};
