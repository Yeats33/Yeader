//! Book entity and repository.

use rusqlite::params;

use crate::Database;

/// A book in the user's bookshelf.
#[derive(Debug, Clone, PartialEq)]
pub struct Book {
    pub book_url: String,
    pub name: String,
    pub author: String,
    pub cover_url: String,
    pub source_url: String,
    pub toc_url: String,
    pub last_read_at: i64,
    pub group_id: Option<i64>,
    pub book_type: i32,
    pub intro: String,
}

// ---------------------------------------------------------------------------
// BookRepo
// ---------------------------------------------------------------------------

pub struct BookRepo<'a> {
    db: &'a Database,
}

impl<'a> BookRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, book: &Book) -> rusqlite::Result<()> {
        self.db.conn().execute(
            "INSERT INTO books (book_url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(book_url) DO UPDATE SET
                name = excluded.name,
                author = excluded.author,
                cover_url = excluded.cover_url,
                source_url = excluded.source_url,
                toc_url = excluded.toc_url,
                last_read_at = excluded.last_read_at,
                group_id = excluded.group_id,
                book_type = excluded.book_type,
                intro = excluded.intro",
            params![
                book.book_url,
                book.name,
                book.author,
                book.cover_url,
                book.source_url,
                book.toc_url,
                book.last_read_at,
                book.group_id,
                book.book_type,
                book.intro,
            ],
        )?;
        Ok(())
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<Book>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro
             FROM books ORDER BY last_read_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Book {
                book_url: row.get(0)?,
                name: row.get(1)?,
                author: row.get(2)?,
                cover_url: row.get(3)?,
                source_url: row.get(4)?,
                toc_url: row.get(5)?,
                last_read_at: row.get::<_, i64>(6)?,
                group_id: row.get(7)?,
                book_type: row.get::<_, i32>(8)?,
                intro: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_by_url(&self, url: &str) -> rusqlite::Result<Option<Book>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT book_url, name, author, cover_url, source_url, toc_url, last_read_at, group_id, book_type, intro
             FROM books WHERE book_url = ?1",
        )?;
        let mut rows = stmt.query_map(params![url], |row| {
            Ok(Book {
                book_url: row.get(0)?,
                name: row.get(1)?,
                author: row.get(2)?,
                cover_url: row.get(3)?,
                source_url: row.get(4)?,
                toc_url: row.get(5)?,
                last_read_at: row.get::<_, i64>(6)?,
                group_id: row.get(7)?,
                book_type: row.get::<_, i32>(8)?,
                intro: row.get(9)?,
            })
        })?;
        rows.next().transpose()
    }

    pub fn delete(&self, url: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM books WHERE book_url = ?1",
            params![url],
        )?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("in-memory db")
    }

    #[test]
    fn book_upsert_and_list() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            book_url: "https://example.com/book/1".into(),
            name: "Test Book".into(),
            author: "Author".into(),
            cover_url: "https://example.com/cover.jpg".into(),
            source_url: "https://example.com".into(),
            toc_url: "https://example.com/toc".into(),
            last_read_at: 0,
            group_id: None,
            book_type: 0,
            intro: "A test book".into(),
        };

        repo.upsert(&book).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Test Book");
    }

    #[test]
    fn book_upsert_updates_existing() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            book_url: "https://example.com/book/1".into(),
            name: "V1".into(),
            author: "".into(),
            cover_url: "".into(),
            source_url: "".into(),
            toc_url: "".into(),
            last_read_at: 0,
            group_id: None,
            book_type: 0,
            intro: "".into(),
        };
        repo.upsert(&book).unwrap();

        let updated = Book { name: "V2".into(), ..book };
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
            book_url: "https://a.com/b".into(),
            name: "A".into(),
            author: "".into(),
            cover_url: "".into(),
            source_url: "".into(),
            toc_url: "".into(),
            last_read_at: 0,
            group_id: None,
            book_type: 0,
            intro: "".into(),
        };
        repo.upsert(&book).unwrap();
        assert!(repo.find_by_url("https://a.com/b").unwrap().is_some());
    }

    #[test]
    fn book_delete() {
        let db = test_db();
        let repo = BookRepo::new(&db);

        let book = Book {
            book_url: "https://del.com".into(),
            name: "Del".into(),
            author: "".into(),
            cover_url: "".into(),
            source_url: "".into(),
            toc_url: "".into(),
            last_read_at: 0,
            group_id: None,
            book_type: 0,
            intro: "".into(),
        };
        repo.upsert(&book).unwrap();
        assert!(repo.delete("https://del.com").unwrap());
        assert!(!repo.delete("https://del.com").unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }
}
