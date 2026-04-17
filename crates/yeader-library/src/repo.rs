//! Repository implementations for each domain entity.

use rusqlite::params;
use serde_json::Map;

use yeader_models::{LegacyBookSource, LegacyReplaceRule, LegacyRssSource, ReadingProgress};

use crate::Database;

// ---------------------------------------------------------------------------
// BookSourceRepo
// ---------------------------------------------------------------------------

pub struct BookSourceRepo<'a> {
    db: &'a Database,
}

impl<'a> BookSourceRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, src: &LegacyBookSource) -> rusqlite::Result<()> {
        let extra = serde_json::to_string(&src.extra).unwrap_or_default();
        self.db.conn().execute(
            "INSERT INTO book_sources (book_source_url, book_source_name, book_source_group, search_url, enabled, extra)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(book_source_url) DO UPDATE SET
                book_source_name = excluded.book_source_name,
                book_source_group = excluded.book_source_group,
                search_url = excluded.search_url,
                enabled = excluded.enabled,
                extra = excluded.extra",
            params![
                src.book_source_url,
                src.book_source_name,
                src.book_source_group,
                src.search_url,
                src.enabled as i32,
                extra,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_batch(&self, sources: &[LegacyBookSource]) -> rusqlite::Result<()> {
        let tx = self.db.conn().unchecked_transaction()?;
        for src in sources {
            let extra = serde_json::to_string(&src.extra).unwrap_or_default();
            tx.execute(
                "INSERT INTO book_sources (book_source_url, book_source_name, book_source_group, search_url, enabled, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(book_source_url) DO UPDATE SET
                    book_source_name = excluded.book_source_name,
                    book_source_group = excluded.book_source_group,
                    search_url = excluded.search_url,
                    enabled = excluded.enabled,
                    extra = excluded.extra",
                params![
                    src.book_source_url,
                    src.book_source_name,
                    src.book_source_group,
                    src.search_url,
                    src.enabled as i32,
                    extra,
                ],
            )?;
        }
        tx.commit()
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<LegacyBookSource>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_source_url, book_source_name, book_source_group, search_url, enabled, extra
             FROM book_sources ORDER BY book_source_name",
        )?;
        let rows = stmt.query_map([], |row| {
            let extra_str: String = row.get(5)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(LegacyBookSource {
                book_source_url: row.get(0)?,
                book_source_name: row.get(1)?,
                book_source_group: row.get(2)?,
                search_url: row.get(3)?,
                enabled: row.get::<_, i32>(4)? != 0,
                extra,
            })
        })?;
        rows.collect()
    }

    pub fn find_by_url(&self, url: &str) -> rusqlite::Result<Option<LegacyBookSource>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_source_url, book_source_name, book_source_group, search_url, enabled, extra
             FROM book_sources WHERE book_source_url = ?1",
        )?;
        let mut rows = stmt.query_map(params![url], |row| {
            let extra_str: String = row.get(5)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(LegacyBookSource {
                book_source_url: row.get(0)?,
                book_source_name: row.get(1)?,
                book_source_group: row.get(2)?,
                search_url: row.get(3)?,
                enabled: row.get::<_, i32>(4)? != 0,
                extra,
            })
        })?;
        rows.next().transpose()
    }

    pub fn delete(&self, url: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM book_sources WHERE book_source_url = ?1",
            params![url],
        )?;
        Ok(count > 0)
    }
}

// ---------------------------------------------------------------------------
// RssSourceRepo
// ---------------------------------------------------------------------------

pub struct RssSourceRepo<'a> {
    db: &'a Database,
}

impl<'a> RssSourceRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, src: &LegacyRssSource) -> rusqlite::Result<()> {
        let extra = serde_json::to_string(&src.extra).unwrap_or_default();
        self.db.conn().execute(
            "INSERT INTO rss_sources (source_url, source_name, source_icon, rule_articles, enabled, extra)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(source_url) DO UPDATE SET
                source_name = excluded.source_name,
                source_icon = excluded.source_icon,
                rule_articles = excluded.rule_articles,
                enabled = excluded.enabled,
                extra = excluded.extra",
            params![
                src.source_url,
                src.source_name,
                src.source_icon,
                src.rule_articles,
                src.enabled as i32,
                extra,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_batch(&self, sources: &[LegacyRssSource]) -> rusqlite::Result<()> {
        let tx = self.db.conn().unchecked_transaction()?;
        for src in sources {
            let extra = serde_json::to_string(&src.extra).unwrap_or_default();
            tx.execute(
                "INSERT INTO rss_sources (source_url, source_name, source_icon, rule_articles, enabled, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(source_url) DO UPDATE SET
                    source_name = excluded.source_name,
                    source_icon = excluded.source_icon,
                    rule_articles = excluded.rule_articles,
                    enabled = excluded.enabled,
                    extra = excluded.extra",
                params![
                    src.source_url,
                    src.source_name,
                    src.source_icon,
                    src.rule_articles,
                    src.enabled as i32,
                    extra,
                ],
            )?;
        }
        tx.commit()
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<LegacyRssSource>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT source_url, source_name, source_icon, rule_articles, enabled, extra
             FROM rss_sources ORDER BY source_name",
        )?;
        let rows = stmt.query_map([], |row| {
            let extra_str: String = row.get(5)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(LegacyRssSource {
                source_url: row.get(0)?,
                source_name: row.get(1)?,
                source_icon: row.get(2)?,
                rule_articles: row.get(3)?,
                enabled: row.get::<_, i32>(4)? != 0,
                extra,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, url: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM rss_sources WHERE source_url = ?1",
            params![url],
        )?;
        Ok(count > 0)
    }
}

// ---------------------------------------------------------------------------
// ReplaceRuleRepo
// ---------------------------------------------------------------------------

pub struct ReplaceRuleRepo<'a> {
    db: &'a Database,
}

impl<'a> ReplaceRuleRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, rule: &LegacyReplaceRule) -> rusqlite::Result<()> {
        let extra = serde_json::to_string(&rule.extra).unwrap_or_default();
        self.db.conn().execute(
            "INSERT INTO replace_rules (id, name, pattern, replacement, is_enabled, extra)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                pattern = excluded.pattern,
                replacement = excluded.replacement,
                is_enabled = excluded.is_enabled,
                extra = excluded.extra",
            params![
                rule.id,
                rule.name,
                rule.pattern,
                rule.replacement,
                rule.is_enabled as i32,
                extra,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_batch(&self, rules: &[LegacyReplaceRule]) -> rusqlite::Result<()> {
        let tx = self.db.conn().unchecked_transaction()?;
        for rule in rules {
            let extra = serde_json::to_string(&rule.extra).unwrap_or_default();
            tx.execute(
                "INSERT INTO replace_rules (id, name, pattern, replacement, is_enabled, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    pattern = excluded.pattern,
                    replacement = excluded.replacement,
                    is_enabled = excluded.is_enabled,
                    extra = excluded.extra",
                params![
                    rule.id,
                    rule.name,
                    rule.pattern,
                    rule.replacement,
                    rule.is_enabled as i32,
                    extra,
                ],
            )?;
        }
        tx.commit()
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<LegacyReplaceRule>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT id, name, pattern, replacement, is_enabled, extra
             FROM replace_rules ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let extra_str: String = row.get(5)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(LegacyReplaceRule {
                id: row.get(0)?,
                name: row.get(1)?,
                pattern: row.get(2)?,
                replacement: row.get(3)?,
                is_enabled: row.get::<_, i32>(4)? != 0,
                extra,
            })
        })?;
        rows.collect()
    }

    pub fn list_enabled(&self) -> rusqlite::Result<Vec<LegacyReplaceRule>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT id, name, pattern, replacement, is_enabled, extra
             FROM replace_rules WHERE is_enabled = 1 ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let extra_str: String = row.get(5)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(LegacyReplaceRule {
                id: row.get(0)?,
                name: row.get(1)?,
                pattern: row.get(2)?,
                replacement: row.get(3)?,
                is_enabled: row.get::<_, i32>(4)? != 0,
                extra,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        let count = self
            .db
            .conn()
            .execute("DELETE FROM replace_rules WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }
}

// ---------------------------------------------------------------------------
// ReadingProgressRepo
// ---------------------------------------------------------------------------

pub struct ReadingProgressRepo<'a> {
    db: &'a Database,
}

impl<'a> ReadingProgressRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, p: &ReadingProgress) -> rusqlite::Result<()> {
        self.db.conn().execute(
            "INSERT INTO reading_progress (book_id, chapter_index, chapter_title, offset)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(book_id) DO UPDATE SET
                chapter_index = excluded.chapter_index,
                chapter_title = excluded.chapter_title,
                offset = excluded.offset",
            params![
                p.book_id,
                p.chapter_index as i64,
                p.chapter_title,
                p.offset as i64
            ],
        )?;
        Ok(())
    }

    pub fn find_by_book(&self, book_id: &str) -> rusqlite::Result<Option<ReadingProgress>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_id, chapter_index, chapter_title, offset
             FROM reading_progress WHERE book_id = ?1",
        )?;
        let mut rows = stmt.query_map(params![book_id], |row| {
            Ok(ReadingProgress {
                book_id: row.get(0)?,
                chapter_index: row.get::<_, i64>(1)? as usize,
                chapter_title: row.get(2)?,
                offset: row.get::<_, i64>(3)? as usize,
            })
        })?;
        rows.next().transpose()
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<ReadingProgress>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_id, chapter_index, chapter_title, offset
             FROM reading_progress ORDER BY book_id",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ReadingProgress {
                book_id: row.get(0)?,
                chapter_index: row.get::<_, i64>(1)? as usize,
                chapter_title: row.get(2)?,
                offset: row.get::<_, i64>(3)? as usize,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, book_id: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM reading_progress WHERE book_id = ?1",
            params![book_id],
        )?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Map, Value};

    use yeader_models::{LegacyBookSource, LegacyReplaceRule, LegacyRssSource, ReadingProgress};

    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("in-memory db")
    }

    // --- BookSourceRepo ---

    #[test]
    fn book_source_upsert_and_list() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        let src = LegacyBookSource {
            book_source_url: "https://example.com".into(),
            book_source_name: "Example".into(),
            book_source_group: Some("Test".into()),
            search_url: Some("https://example.com/s?q={{key}}".into()),
            enabled: true,
            extra: Map::new(),
        };

        repo.upsert(&src).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].book_source_name, "Example");
    }

    #[test]
    fn book_source_upsert_updates_existing() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        let src = LegacyBookSource {
            book_source_url: "https://example.com".into(),
            book_source_name: "V1".into(),
            book_source_group: None,
            search_url: None,
            enabled: true,
            extra: Map::new(),
        };
        repo.upsert(&src).unwrap();

        let updated = LegacyBookSource {
            book_source_name: "V2".into(),
            ..src
        };
        repo.upsert(&updated).unwrap();

        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].book_source_name, "V2");
    }

    #[test]
    fn book_source_find_by_url() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        assert!(repo.find_by_url("nope").unwrap().is_none());

        let src = LegacyBookSource {
            book_source_url: "https://a.com".into(),
            book_source_name: "A".into(),
            book_source_group: None,
            search_url: None,
            enabled: true,
            extra: Map::new(),
        };
        repo.upsert(&src).unwrap();
        assert!(repo.find_by_url("https://a.com").unwrap().is_some());
    }

    #[test]
    fn book_source_delete() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        let src = LegacyBookSource {
            book_source_url: "https://del.com".into(),
            book_source_name: "Del".into(),
            book_source_group: None,
            search_url: None,
            enabled: true,
            extra: Map::new(),
        };
        repo.upsert(&src).unwrap();
        assert!(repo.delete("https://del.com").unwrap());
        assert!(!repo.delete("https://del.com").unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }

    #[test]
    fn book_source_batch_upsert() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        let sources: Vec<LegacyBookSource> = (0..3)
            .map(|i| LegacyBookSource {
                book_source_url: format!("https://{i}.com"),
                book_source_name: format!("Source {i}"),
                book_source_group: None,
                search_url: None,
                enabled: true,
                extra: Map::new(),
            })
            .collect();

        repo.upsert_batch(&sources).unwrap();
        assert_eq!(repo.list_all().unwrap().len(), 3);
    }

    #[test]
    fn book_source_preserves_extra_fields() {
        let db = test_db();
        let repo = BookSourceRepo::new(&db);

        let mut extra = Map::new();
        extra.insert("customField".into(), Value::String("hello".into()));

        let src = LegacyBookSource {
            book_source_url: "https://extra.com".into(),
            book_source_name: "Extra".into(),
            book_source_group: None,
            search_url: None,
            enabled: true,
            extra,
        };
        repo.upsert(&src).unwrap();

        let found = repo.find_by_url("https://extra.com").unwrap().unwrap();
        assert_eq!(
            found.extra.get("customField"),
            Some(&Value::String("hello".into()))
        );
    }

    // --- RssSourceRepo ---

    #[test]
    fn rss_source_upsert_and_list() {
        let db = test_db();
        let repo = RssSourceRepo::new(&db);

        let src = LegacyRssSource {
            source_url: "https://rss.example.com".into(),
            source_name: "RSS Feed".into(),
            source_icon: "https://icon.png".into(),
            rule_articles: Some("class.list".into()),
            enabled: true,
            extra: Map::new(),
        };

        repo.upsert(&src).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].source_name, "RSS Feed");
    }

    #[test]
    fn rss_source_batch_and_delete() {
        let db = test_db();
        let repo = RssSourceRepo::new(&db);

        let sources: Vec<LegacyRssSource> = (0..2)
            .map(|i| LegacyRssSource {
                source_url: format!("https://rss{i}.com"),
                source_name: format!("Feed {i}"),
                source_icon: String::new(),
                rule_articles: None,
                enabled: true,
                extra: Map::new(),
            })
            .collect();

        repo.upsert_batch(&sources).unwrap();
        assert_eq!(repo.list_all().unwrap().len(), 2);
        assert!(repo.delete("https://rss0.com").unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 1);
    }

    // --- ReplaceRuleRepo ---

    #[test]
    fn replace_rule_upsert_and_list() {
        let db = test_db();
        let repo = ReplaceRuleRepo::new(&db);

        let rule = LegacyReplaceRule {
            id: 1,
            name: "Strip ads".into(),
            pattern: "广告".into(),
            replacement: String::new(),
            is_enabled: true,
            extra: Map::new(),
        };

        repo.upsert(&rule).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Strip ads");
    }

    #[test]
    fn replace_rule_list_enabled() {
        let db = test_db();
        let repo = ReplaceRuleRepo::new(&db);

        repo.upsert(&LegacyReplaceRule {
            id: 1,
            name: "On".into(),
            pattern: "a".into(),
            replacement: "b".into(),
            is_enabled: true,
            extra: Map::new(),
        })
        .unwrap();
        repo.upsert(&LegacyReplaceRule {
            id: 2,
            name: "Off".into(),
            pattern: "c".into(),
            replacement: "d".into(),
            is_enabled: false,
            extra: Map::new(),
        })
        .unwrap();

        assert_eq!(repo.list_all().unwrap().len(), 2);
        let enabled = repo.list_enabled().unwrap();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].name, "On");
    }

    #[test]
    fn replace_rule_batch_and_delete() {
        let db = test_db();
        let repo = ReplaceRuleRepo::new(&db);

        let rules: Vec<LegacyReplaceRule> = (0..3)
            .map(|i| LegacyReplaceRule {
                id: i,
                name: format!("Rule {i}"),
                pattern: format!("p{i}"),
                replacement: String::new(),
                is_enabled: true,
                extra: Map::new(),
            })
            .collect();

        repo.upsert_batch(&rules).unwrap();
        assert_eq!(repo.list_all().unwrap().len(), 3);
        assert!(repo.delete(1).unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 2);
    }

    // --- ReadingProgressRepo ---

    #[test]
    fn progress_upsert_and_find() {
        let db = test_db();
        let repo = ReadingProgressRepo::new(&db);

        let p = ReadingProgress {
            book_id: "book-1".into(),
            chapter_index: 5,
            chapter_title: "Chapter 5".into(),
            offset: 1234,
        };

        repo.upsert(&p).unwrap();
        let found = repo.find_by_book("book-1").unwrap().unwrap();
        assert_eq!(found.chapter_index, 5);
        assert_eq!(found.offset, 1234);
    }

    #[test]
    fn progress_upsert_updates_position() {
        let db = test_db();
        let repo = ReadingProgressRepo::new(&db);

        let p1 = ReadingProgress {
            book_id: "book-1".into(),
            chapter_index: 1,
            chapter_title: "Ch 1".into(),
            offset: 0,
        };
        repo.upsert(&p1).unwrap();

        let p2 = ReadingProgress {
            chapter_index: 3,
            chapter_title: "Ch 3".into(),
            offset: 500,
            ..p1
        };
        repo.upsert(&p2).unwrap();

        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].chapter_index, 3);
        assert_eq!(all[0].offset, 500);
    }

    #[test]
    fn progress_delete() {
        let db = test_db();
        let repo = ReadingProgressRepo::new(&db);

        let p = ReadingProgress {
            book_id: "book-x".into(),
            chapter_index: 0,
            chapter_title: String::new(),
            offset: 0,
        };
        repo.upsert(&p).unwrap();
        assert!(repo.delete("book-x").unwrap());
        assert!(!repo.delete("book-x").unwrap());
        assert!(repo.find_by_book("book-x").unwrap().is_none());
    }
}
