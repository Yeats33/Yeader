//! Shared domain models for the Yeader migration.

pub mod compatibility;
pub mod legacy;
pub mod library;
pub mod search;

pub use compatibility::{CompatImportArtifact, ImportArtifactKind};
pub use legacy::{
    LEGADO_BACKUP_FILES, LegacyBookSource, LegacyReplaceRule, LegacyRssSource, parse_book_sources,
    parse_replace_rules, parse_rss_sources,
};
pub use library::{BookId, BookshelfEntry, ReadingProgress};
pub use search::{SearchQuery, SearchResult};
