//! Repository implementations for each domain entity.

use rusqlite::params;
use serde_json::Map;

use yeader_models::{Book, BookGroup, Bookmark, LegacyBookSource, LegacyReplaceRule, LegacyRssSource, ReadingProgress};

use crate::Database;

fn row_to_source(row: &rusqlite::Row<'_>) -> rusqlite::Result<LegacyBookSource> {
    let source_json: String = row.get(0)?;
    if let Ok(src) = serde_json::from_str::<LegacyBookSource>(&source_json) {
        return Ok(src);
    }
    let extra_str: String = row.get(6)?;
    let extra: Map<String, serde_json::Value> =
        serde_json::from_str(&extra_str).unwrap_or_default();
    Ok(LegacyBookSource {
        book_source_url: row.get(1)?,
        book_source_name: row.get(2)?,
        book_source_group: row.get(3)?,
        search_url: row.get(4)?,
        book_url_pattern: None,
        login_check_js: None,
        book_source_type: None,
        enabled_explore: None,
        explore_url: None,
        rule_search: None,
        rule_book_info: None,
        rule_toc: None,
        rule_content: None,
        enabled: row.get::<_, i32>(5)? != 0,
        last_test_available: None,
        last_tested_at: None,
        last_test_detail: None,
        extra,
    })
}

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
        let source_json = serde_json::to_string(src).unwrap_or_default();
        self.db.conn().execute(
            "INSERT INTO book_sources (book_source_url, book_source_name, book_source_group, search_url, enabled, extra, source_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(book_source_url) DO UPDATE SET
                book_source_name = excluded.book_source_name,
                book_source_group = excluded.book_source_group,
                search_url = excluded.search_url,
                enabled = excluded.enabled,
                extra = excluded.extra,
                source_json = excluded.source_json",
            params![
                src.book_source_url,
                src.book_source_name,
                src.book_source_group,
                src.search_url,
                src.enabled as i32,
                extra,
                source_json,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_batch(&self, sources: &[LegacyBookSource]) -> rusqlite::Result<()> {
        let tx = self.db.conn().unchecked_transaction()?;
        for src in sources {
            let extra = serde_json::to_string(&src.extra).unwrap_or_default();
            let source_json = serde_json::to_string(src).unwrap_or_default();
            tx.execute(
                "INSERT INTO book_sources (book_source_url, book_source_name, book_source_group, search_url, enabled, extra, source_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(book_source_url) DO UPDATE SET
                    book_source_name = excluded.book_source_name,
                    book_source_group = excluded.book_source_group,
                    search_url = excluded.search_url,
                    enabled = excluded.enabled,
                    extra = excluded.extra,
                    source_json = excluded.source_json",
                params![
                    src.book_source_url,
                    src.book_source_name,
                    src.book_source_group,
                    src.search_url,
                    src.enabled as i32,
                    extra,
                    source_json,
                ],
            )?;
        }
        tx.commit()
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<LegacyBookSource>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT source_json, book_source_url, book_source_name, book_source_group, search_url, enabled, extra
             FROM book_sources ORDER BY book_source_name",
        )?;
        let rows = stmt.query_map([], row_to_source)?;
        rows.collect()
    }

    pub fn find_by_url(&self, url: &str) -> rusqlite::Result<Option<LegacyBookSource>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT source_json, book_source_url, book_source_name, book_source_group, search_url, enabled, extra
             FROM book_sources WHERE book_source_url = ?1",
        )?;
        let mut rows = stmt.query_map(params![url], row_to_source)?;
        rows.next().transpose()
    }

    pub fn delete(&self, url: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM book_sources WHERE book_source_url = ?1",
            params![url],
        )?;
        Ok(count > 0)
    }

    pub fn set_enabled(&self, url: &str, enabled: bool) -> rusqlite::Result<bool> {
        let Some(mut source) = self.find_by_url(url)? else {
            return Ok(false);
        };
        source.enabled = enabled;
        self.upsert(&source)?;
        Ok(true)
    }

    pub fn set_test_result(
        &self,
        url: &str,
        available: bool,
        detail: Option<String>,
        tested_at: &str,
    ) -> rusqlite::Result<bool> {
        let rows = self.db.conn().execute(
            "UPDATE book_sources SET last_test_available = ?2, last_tested_at = ?3, last_test_detail = ?4 WHERE book_source_url = ?1",
            params![url, available as i32, tested_at, detail],
        )?;
        Ok(rows > 0)
    }

    pub fn set_test_result_batch(
        &self,
        results: &[(String, bool, Option<String>, String)],
    ) -> rusqlite::Result<usize> {
        let tx = self.db.conn().unchecked_transaction()?;
        let mut count = 0;
        for (url, available, detail, tested_at) in results {
            let rows = tx.execute(
                "UPDATE book_sources SET last_test_available = ?2, last_tested_at = ?3, last_test_detail = ?4 WHERE book_source_url = ?1",
                params![url, *available as i32, tested_at, detail],
            )?;
            count += rows;
        }
        tx.commit()?;
        Ok(count)
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

// ---------------------------------------------------------------------------
// BookRepo
// ---------------------------------------------------------------------------

pub struct BookRepo<'a>(&'a Database);

impl<'a> BookRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self(db)
    }

    pub fn upsert(&self, book: &Book) -> rusqlite::Result<()> {
        let extra = serde_json::to_string(&book.extra).unwrap_or_default();
        self.0.conn().execute(
            "INSERT INTO books (url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro, extra)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(url) DO UPDATE SET
                name = excluded.name,
                author = excluded.author,
                cover_url = excluded.cover_url,
                source_url = excluded.source_url,
                toc_url = excluded.toc_url,
                last_read_at = excluded.last_read_at,
                group_id = excluded.group_id,
                book_type = excluded.book_type,
                intro = excluded.intro,
                extra = excluded.extra",
            params![
                book.url,
                book.name,
                book.author,
                book.cover_url,
                book.source_url,
                book.toc_url,
                book.last_read_at,
                book.group_id,
                book.book_type,
                book.intro,
                extra,
            ],
        )?;
        Ok(())
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<Book>> {
        let mut stmt = self.0.conn().prepare(
            "SELECT url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro, extra
             FROM books ORDER BY last_read_at DESC NULLS LAST, name",
        )?;
        let rows = stmt.query_map([], |row| {
            let extra_str: String = row.get(10)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(Book {
                url: row.get(0)?,
                name: row.get(1)?,
                author: row.get(2)?,
                cover_url: row.get(3)?,
                source_url: row.get(4)?,
                toc_url: row.get(5)?,
                last_read_at: row.get(6)?,
                group_id: row.get(7)?,
                book_type: row.get(8)?,
                intro: row.get(9)?,
                extra,
            })
        })?;
        rows.collect()
    }

    pub fn find_by_url(&self, url: &str) -> rusqlite::Result<Option<Book>> {
        let mut stmt = self.0.conn().prepare(
            "SELECT url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro, extra
             FROM books WHERE url = ?1",
        )?;
        let mut rows = stmt.query_map(params![url], |row| {
            let extra_str: String = row.get(10)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(Book {
                url: row.get(0)?,
                name: row.get(1)?,
                author: row.get(2)?,
                cover_url: row.get(3)?,
                source_url: row.get(4)?,
                toc_url: row.get(5)?,
                last_read_at: row.get(6)?,
                group_id: row.get(7)?,
                book_type: row.get(8)?,
                intro: row.get(9)?,
                extra,
            })
        })?;
        rows.next().transpose()
    }

    pub fn delete(&self, url: &str) -> rusqlite::Result<bool> {
        let count = self
            .0
            .conn()
            .execute("DELETE FROM books WHERE url = ?1", params![url])?;
        Ok(count > 0)
    }

    pub fn list_by_group(&self, group_id: i64) -> rusqlite::Result<Vec<Book>> {
        let mut stmt = self.0.conn().prepare(
            "SELECT url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro, extra
             FROM books WHERE group_id = ?1 ORDER BY name",
        )?;
        let rows = stmt.query_map(params![group_id], |row| {
            let extra_str: String = row.get(10)?;
            let extra: Map<String, serde_json::Value> =
                serde_json::from_str(&extra_str).unwrap_or_default();
            Ok(Book {
                url: row.get(0)?,
                name: row.get(1)?,
                author: row.get(2)?,
                cover_url: row.get(3)?,
                source_url: row.get(4)?,
                toc_url: row.get(5)?,
                last_read_at: row.get(6)?,
                group_id: row.get(7)?,
                book_type: row.get(8)?,
                intro: row.get(9)?,
                extra,
            })
        })?;
        rows.collect()
    }
}

// ---------------------------------------------------------------------------
// BookGroupRepo
// ---------------------------------------------------------------------------

pub struct BookGroupRepo<'a>(&'a Database);

impl<'a> BookGroupRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self(db)
    }

    pub fn upsert(&self, g: &BookGroup) -> rusqlite::Result<()> {
        self.0.conn().execute(
            "INSERT INTO book_groups (id, name, sort_order)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                sort_order = excluded.sort_order",
            params![g.id, g.name, g.sort_order],
        )?;
        Ok(())
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<BookGroup>> {
        let mut stmt = self
            .0
            .conn()
            .prepare("SELECT id, name, sort_order FROM book_groups ORDER BY sort_order")?;
        let rows = stmt.query_map([], |row| {
            Ok(BookGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_by_id(&self, id: i64) -> rusqlite::Result<Option<BookGroup>> {
        let mut stmt = self
            .0
            .conn()
            .prepare("SELECT id, name, sort_order FROM book_groups WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(BookGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
            })
        })?;
        rows.next().transpose()
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        let count = self
            .0
            .conn()
            .execute("DELETE FROM book_groups WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }
}

// ---------------------------------------------------------------------------
// BookmarkRepo
// ---------------------------------------------------------------------------

pub struct BookmarkRepo<'a>(&'a Database);

impl<'a> BookmarkRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self(db)
    }

    pub fn upsert(&self, b: &Bookmark) -> rusqlite::Result<()> {
        self.0.conn().execute(
            "INSERT INTO bookmarks (id, book_url, chapter_index, chapter_title, offset, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                book_url = excluded.book_url,
                chapter_index = excluded.chapter_index,
                chapter_title = excluded.chapter_title,
                offset = excluded.offset,
                note = excluded.note,
                created_at = excluded.created_at",
            params![
                b.id,
                b.book_url,
                b.chapter_index as i64,
                b.chapter_title,
                b.offset as i64,
                b.note,
                b.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_by_book(&self, book_url: &str) -> rusqlite::Result<Vec<Bookmark>> {
        let mut stmt = self.0.conn().prepare(
            "SELECT id, book_url, chapter_index, chapter_title, offset, note, created_at
             FROM bookmarks WHERE book_url = ?1 ORDER BY chapter_index, offset",
        )?;
        let rows = stmt.query_map(params![book_url], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                book_url: row.get(1)?,
                chapter_index: row.get::<_, i64>(2)? as usize,
                chapter_title: row.get(3)?,
                offset: row.get::<_, i64>(4)? as usize,
                note: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        let count = self
            .0
            .conn()
            .execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }

    pub fn delete_by_book(&self, book_url: &str) -> rusqlite::Result<usize> {
        self.0
            .conn()
            .execute("DELETE FROM bookmarks WHERE book_url = ?1", params![book_url])
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
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
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
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
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
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
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
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
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
                book_url_pattern: None,
                login_check_js: None,
                book_source_type: None,
                enabled_explore: None,
                explore_url: None,
                rule_search: None,
                rule_book_info: None,
                rule_toc: None,
                rule_content: None,
                enabled: true,
                last_test_available: None,
                last_tested_at: None,
                last_test_detail: None,
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
            book_url_pattern: None,
            login_check_js: None,
            book_source_type: None,
            enabled_explore: None,
            explore_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            enabled: true,
            last_test_available: None,
            last_tested_at: None,
            last_test_detail: None,
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

    // --- BookRepo ---

    #[test]
    fn book_upsert_and_list() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            url: "https://example.com/book/1".into(),
            name: "Example Book".into(),
            author: "Author A".into(),
            cover_url: Some("https://cover.png".into()),
            source_url: "https://source.com".into(),
            toc_url: Some("https://example.com/toc".into()),
            last_read_at: Some("2026-01-01T00:00:00Z".into()),
            group_id: None,
            book_type: Some("novel".into()),
            intro: Some("A great book.".into()),
            extra: Map::new(),
        };

        repo.upsert(&book).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Example Book");
    }

    #[test]
    fn book_upsert_updates_existing() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            url: "https://example.com/book/1".into(),
            name: "V1".into(),
            author: String::new(),
            cover_url: None,
            source_url: "https://source.com".into(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            extra: Map::new(),
        };
        repo.upsert(&book).unwrap();

        let updated = Book {
            name: "V2".into(),
            ..book
        };
        repo.upsert(&updated).unwrap();

        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "V2");
    }

    #[test]
    fn book_find_by_url() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        assert!(repo.find_by_url("nope").unwrap().is_none());

        let book = Book {
            url: "https://example.com/book/1".into(),
            name: "Test".into(),
            author: String::new(),
            cover_url: None,
            source_url: "https://source.com".into(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            extra: Map::new(),
        };
        repo.upsert(&book).unwrap();
        assert!(repo.find_by_url("https://example.com/book/1").unwrap().is_some());
    }

    #[test]
    fn book_delete() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            url: "https://example.com/del".into(),
            name: "Del".into(),
            author: String::new(),
            cover_url: None,
            source_url: "https://source.com".into(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            extra: Map::new(),
        };
        repo.upsert(&book).unwrap();
        assert!(repo.delete("https://example.com/del").unwrap());
        assert!(!repo.delete("https://example.com/del").unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }

    #[test]
    fn book_list_by_group() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        repo.upsert(&Book {
            url: "https://example.com/1".into(),
            name: "Book 1".into(),
            author: String::new(),
            cover_url: None,
            source_url: "https://source.com".into(),
            toc_url: None,
            last_read_at: None,
            group_id: Some(1),
            book_type: None,
            intro: None,
            extra: Map::new(),
        }).unwrap();
        repo.upsert(&Book {
            url: "https://example.com/2".into(),
            name: "Book 2".into(),
            author: String::new(),
            cover_url: None,
            source_url: "https://source.com".into(),
            toc_url: None,
            last_read_at: None,
            group_id: Some(2),
            book_type: None,
            intro: None,
            extra: Map::new(),
        }).unwrap();

        let group1 = repo.list_by_group(1).unwrap();
        assert_eq!(group1.len(), 1);
        assert_eq!(group1[0].name, "Book 1");
    }

    // --- BookGroupRepo ---

    #[test]
    fn book_group_upsert_and_list() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        let group = BookGroup {
            id: 1,
            name: "Favorites".into(),
            sort_order: 0,
        };

        repo.upsert(&group).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Favorites");
    }

    #[test]
    fn book_group_find_by_id() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        assert!(repo.find_by_id(99).unwrap().is_none());

        repo.upsert(&BookGroup {
            id: 42,
            name: "Test".into(),
            sort_order: 5,
        }).unwrap();
        let found = repo.find_by_id(42).unwrap().unwrap();
        assert_eq!(found.name, "Test");
        assert_eq!(found.sort_order, 5);
    }

    #[test]
    fn book_group_delete() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        repo.upsert(&BookGroup {
            id: 1,
            name: "To Delete".into(),
            sort_order: 0,
        }).unwrap();
        assert!(repo.delete(1).unwrap());
        assert!(!repo.delete(1).unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }

    // --- BookmarkRepo ---

    #[test]
    fn bookmark_upsert_and_list() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);

        let bm = Bookmark {
            id: 1,
            book_url: "https://example.com/book/1".into(),
            chapter_index: 3,
            chapter_title: "Chapter 3".into(),
            offset: 500,
            note: Some("Important passage".into()),
            created_at: "2026-01-01T00:00:00Z".into(),
        };

        repo.upsert(&bm).unwrap();
        let all = repo.list_by_book("https://example.com/book/1").unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].chapter_title, "Chapter 3");
    }

    #[test]
    fn bookmark_delete() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);

        repo.upsert(&Bookmark {
            id: 1,
            book_url: "https://example.com/book/1".into(),
            chapter_index: 0,
            chapter_title: String::new(),
            offset: 0,
            note: None,
            created_at: "2026-01-01T00:00:00Z".into(),
        }).unwrap();
        assert!(repo.delete(1).unwrap());
        assert!(!repo.delete(1).unwrap());
        assert_eq!(repo.list_by_book("https://example.com/book/1").unwrap().len(), 0);
    }

    #[test]
    fn bookmark_delete_by_book() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);

        repo.upsert(&Bookmark {
            id: 1,
            book_url: "https://example.com/book/x".into(),
            chapter_index: 0,
            chapter_title: String::new(),
            offset: 0,
            note: None,
            created_at: "2026-01-01T00:00:00Z".into(),
        }).unwrap();
        repo.upsert(&Bookmark {
            id: 2,
            book_url: "https://example.com/book/x".into(),
            chapter_index: 1,
            chapter_title: String::new(),
            offset: 0,
            note: None,
            created_at: "2026-01-01T00:00:00Z".into(),
        }).unwrap();

        let deleted = repo.delete_by_book("https://example.com/book/x").unwrap();
        assert_eq!(deleted, 2);
        assert!(repo.list_by_book("https://example.com/book/x").unwrap().is_empty());
    }
}
