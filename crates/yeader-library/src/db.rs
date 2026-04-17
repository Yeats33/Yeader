//! Database initialization and migrations.

use rusqlite::Connection;

/// Wrapper around a SQLite connection with automatic migrations.
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open (or create) a database file and run migrations.
    pub fn open(path: &str) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Create an in-memory database (useful for tests).
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS book_sources (
                book_source_url  TEXT PRIMARY KEY,
                book_source_name TEXT NOT NULL,
                book_source_group TEXT,
                search_url       TEXT,
                enabled          INTEGER NOT NULL DEFAULT 1,
                extra            TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS rss_sources (
                source_url   TEXT PRIMARY KEY,
                source_name  TEXT NOT NULL,
                source_icon  TEXT NOT NULL DEFAULT '',
                rule_articles TEXT,
                enabled      INTEGER NOT NULL DEFAULT 1,
                extra        TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS replace_rules (
                id          INTEGER PRIMARY KEY,
                name        TEXT NOT NULL,
                pattern     TEXT NOT NULL,
                replacement TEXT NOT NULL DEFAULT '',
                is_enabled  INTEGER NOT NULL DEFAULT 1,
                extra       TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS reading_progress (
                book_id       TEXT PRIMARY KEY,
                chapter_index INTEGER NOT NULL DEFAULT 0,
                chapter_title TEXT NOT NULL DEFAULT '',
                offset        INTEGER NOT NULL DEFAULT 0
            );
            ",
        )
    }
}
