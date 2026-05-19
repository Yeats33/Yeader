//! Shared domain models for the Yeader migration.

pub mod compatibility;
pub mod dev;
pub mod legacy;
pub mod library;
pub mod rule;
pub mod search;
pub mod source_format;

pub use compatibility::{CompatImportArtifact, ImportArtifactKind};
pub use dev::{DevModeStatus, LogLine};
pub use legacy::{
    LEGADO_BACKUP_FILES, LegacyBookSource, LegacyReplaceRule, LegacyRssSource, parse_book_sources,
    parse_replace_rules, parse_rss_sources,
};
pub use library::{Book, BookGroup, BookId, BookInfo, Bookmark, Chapter, ReadingProgress};
pub use rule::{BookInfoRule, ContentRule, SearchRule, TocRule};
pub use search::{SearchQuery, SearchResult};
pub use source_format::{
    YeaderAction, YeaderActionKind, YeaderCapability, YeaderCapabilityKind, YeaderMediaType,
    YeaderPagination, YeaderRequest, YeaderRequestDefaults, YeaderSelector, YeaderSelectorEngine,
    YeaderSource, YeaderSourcePack, parse_yeader_source_pack,
};
