//! Unified registry for all source types.
//!
//! Provides a single entry point for listing, importing, deleting, and toggling
//! book sources, RSS sources, and Yeader-native sources.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use yeader_models::{YeaderSource, parse_book_sources, parse_rss_sources};

use crate::{BookSourceRepo, Database, RssSourceRepo, YeaderSourceRepo};

/// Kinds of source supported by the registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    /// Legado-format book source.
    BookSource,
    /// Legado-format RSS source.
    Rss,
    /// Yeader-native rule/source contract.
    ///
    /// The serialized value remains `plugin` for compatibility with the
    /// existing source registry API. This variant is not the source-plugin
    /// runtime lane described in the plugin roadmap.
    Plugin,
}

impl SourceKind {
    /// Parse a string into a SourceKind, returning None for unknown values.
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "booksource" | "book" => Some(SourceKind::BookSource),
            "rss" => Some(SourceKind::Rss),
            "plugin" | "yeader" => Some(SourceKind::Plugin),
            _ => None,
        }
    }

    /// Return the lowercase string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceKind::BookSource => "booksource",
            SourceKind::Rss => "rss",
            SourceKind::Plugin => "plugin",
        }
    }
}

/// A source that may be a book source, RSS source, or Yeader-native source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum UnifiedSource {
    BookSource(yeader_models::LegacyBookSource),
    Rss(yeader_models::LegacyRssSource),
    /// Yeader-native source stored in `yeader_sources`.
    ///
    /// Kept as `Plugin` for compatibility; do not treat this as source-plugin
    /// runtime execution without an explicit API migration.
    Plugin(YeaderSource),
}

impl UnifiedSource {
    /// Return the stable identifier for this source.
    pub fn id(&self) -> String {
        match self {
            UnifiedSource::BookSource(s) => s.book_source_url.clone(),
            UnifiedSource::Rss(s) => s.source_url.clone(),
            UnifiedSource::Plugin(s) => s.id.clone(),
        }
    }

    /// Return the human-readable name.
    pub fn name(&self) -> String {
        match self {
            UnifiedSource::BookSource(s) => s.book_source_name.clone(),
            UnifiedSource::Rss(s) => s.source_name.clone(),
            UnifiedSource::Plugin(s) => s.name.clone(),
        }
    }

    /// Return whether this source is currently enabled.
    pub fn enabled(&self) -> bool {
        match self {
            UnifiedSource::BookSource(s) => s.enabled,
            UnifiedSource::Rss(s) => s.enabled,
            UnifiedSource::Plugin(s) => s.enabled,
        }
    }
}

/// Registry providing unified access to all source types.
pub struct SourceRegistry<'a> {
    db: &'a Database,
}

impl<'a> SourceRegistry<'a> {
    /// Create a new registry backed by the given database.
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// List all sources, optionally filtered by kind.
    pub fn list_sources(&self, kind: Option<SourceKind>) -> Vec<UnifiedSource> {
        let mut sources = Vec::new();

        if kind.is_none() || kind == Some(SourceKind::BookSource) {
            let repo = BookSourceRepo::new(self.db);
            if let Ok(list) = repo.list_all() {
                sources.extend(list.into_iter().map(UnifiedSource::BookSource));
            }
        }

        if kind.is_none() || kind == Some(SourceKind::Rss) {
            let repo = RssSourceRepo::new(self.db);
            if let Ok(list) = repo.list_all() {
                sources.extend(list.into_iter().map(UnifiedSource::Rss));
            }
        }

        if kind.is_none() || kind == Some(SourceKind::Plugin) {
            let repo = YeaderSourceRepo::new(self.db);
            if let Ok(list) = repo.list_all() {
                sources.extend(list.into_iter().map(UnifiedSource::Plugin));
            }
        }

        sources
    }

    /// Import a source from JSON, auto-detecting the format.
    ///
    /// Supported formats:
    /// - `{ "format": "yeader.source-pack", "sources": [...] }` → YeaderSource[]
    /// - `[{ "bookSourceUrl": "...", ... }]` → LegacyBookSource[]
    /// - `[{ "sourceUrl": "...", ... }]` → LegacyRssSource[]
    ///
    /// Returns the first imported source, or an error if parsing failed.
    pub fn import_source(&self, json: &str) -> Result<UnifiedSource, String> {
        let value: Value =
            serde_json::from_str(json).map_err(|e| format!("invalid JSON: {}", e))?;

        // Try yeader source pack
        if let Some(obj) = value.as_object() {
            if obj.contains_key("format") && obj.contains_key("sources") {
                return self.import_yeader_pack(json).map(UnifiedSource::Plugin);
            }
        }

        // Try array of book sources
        if let Some(arr) = value.as_array() {
            if !arr.is_empty() {
                if arr[0].get("bookSourceUrl").is_some() {
                    return self
                        .import_book_sources(json)
                        .map(UnifiedSource::BookSource);
                }
                if arr[0].get("sourceUrl").is_some() {
                    return self.import_rss_sources(json).map(UnifiedSource::Rss);
                }
            }
        }

        Err("unrecognized source format".to_string())
    }

    fn import_yeader_pack(&self, json: &str) -> Result<YeaderSource, String> {
        let pack = yeader_models::parse_yeader_source_pack(json)
            .map_err(|e| format!("invalid source pack: {}", e))?;
        let repo = YeaderSourceRepo::new(self.db);
        repo.upsert_batch(&pack.sources)
            .map_err(|e| e.to_string())?;
        pack.sources
            .first()
            .cloned()
            .ok_or_else(|| "source pack is empty".to_string())
    }

    fn import_book_sources(&self, json: &str) -> Result<yeader_models::LegacyBookSource, String> {
        let sources =
            parse_book_sources(json).map_err(|e| format!("invalid book sources: {}", e))?;
        let repo = BookSourceRepo::new(self.db);
        repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
        sources
            .first()
            .cloned()
            .ok_or_else(|| "book source list is empty".to_string())
    }

    fn import_rss_sources(&self, json: &str) -> Result<yeader_models::LegacyRssSource, String> {
        let sources = parse_rss_sources(json).map_err(|e| format!("invalid RSS sources: {}", e))?;
        let repo = RssSourceRepo::new(self.db);
        repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
        sources
            .first()
            .cloned()
            .ok_or_else(|| "RSS source list is empty".to_string())
    }

    /// Delete a source by its identifier and kind.
    pub fn delete_source(&self, id: &str, kind: SourceKind) -> Result<bool, String> {
        match kind {
            SourceKind::BookSource => {
                let repo = BookSourceRepo::new(self.db);
                repo.delete(id).map_err(|e| e.to_string())
            }
            SourceKind::Rss => {
                let repo = RssSourceRepo::new(self.db);
                repo.delete(id).map_err(|e| e.to_string())
            }
            SourceKind::Plugin => {
                let repo = YeaderSourceRepo::new(self.db);
                repo.delete(id).map_err(|e| e.to_string())
            }
        }
    }

    /// Enable or disable a source.
    pub fn toggle_source(&self, id: &str, kind: SourceKind, enabled: bool) -> Result<bool, String> {
        match kind {
            SourceKind::BookSource => {
                let repo = BookSourceRepo::new(self.db);
                repo.set_enabled(id, enabled).map_err(|e| e.to_string())
            }
            SourceKind::Rss => {
                // RssSourceRepo doesn't have set_enabled; implement via upsert
                let repo = RssSourceRepo::new(self.db);
                let mut sources = repo.list_all().map_err(|e| e.to_string())?;
                if let Some(idx) = sources.iter().position(|s| s.source_url == id) {
                    sources[idx].enabled = enabled;
                    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
            SourceKind::Plugin => {
                let repo = YeaderSourceRepo::new(self.db);
                // Fetch, mutate enabled, then upsert so source_json is updated.
                let Some(mut source) = repo.find_by_id(id).map_err(|e| e.to_string())? else {
                    return Ok(false);
                };
                source.enabled = enabled;
                repo.upsert(&source).map_err(|e| e.to_string())?;
                Ok(true)
            }
        }
    }
}
