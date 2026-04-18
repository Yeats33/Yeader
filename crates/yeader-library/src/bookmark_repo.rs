//! Bookmark entity and repository.

use rusqlite::params;

use crate::{Database, Book, BookRepo};

/// A reader bookmark.
#[derive(Debug, Clone, PartialEq)]
pub struct Bookmark {
    pub id: i64,
    pub book_id: String,
    pub chapter_index: i64,
    pub offset: i64,
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// BookmarkRepo
// ---------------------------------------------------------------------------

pub struct BookmarkRepo<'a> {
    db: &'a Database,
}

impl<'a> BookmarkRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, bookmark: &Bookmark) -> rusqlite::Result<i64> {
        if bookmark.id == 0 {
            self.db.conn().execute(
                "INSERT INTO bookmarks (book_id, chapter_index, offset, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    bookmark.book_id,
                    bookmark.chapter_index,
                    bookmark.offset,
                    bookmark.created_at,
                ],
            )?;
            Ok(self.db.conn().last_insert_rowid())
        } else {
            self.db.conn().execute(
                "INSERT INTO bookmarks (id, book_id, chapter_index, offset, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                    book_id = excluded.book_id,
                    chapter_index = excluded.chapter_index,
                    offset = excluded.offset,
                    created_at = excluded.created_at",
                params![
                    bookmark.id,
                    bookmark.book_id,
                    bookmark.chapter_index,
                    bookmark.offset,
                    bookmark.created_at,
                ],
            )?;
            Ok(bookmark.id)
        }
    }

    pub fn list_by_book(&self, book_id: &str) -> rusqlite::Result<Vec<Bookmark>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT id, book_id, chapter_index, offset, created_at
             FROM bookmarks WHERE book_id = ?1 ORDER BY chapter_index, offset",
        )?;
        let rows = stmt.query_map(params![book_id], |row| {
            Ok(Bookmark {
                id: row.get::<_, i64>(0)?,
                book_id: row.get(1)?,
                chapter_index: row.get::<_, i64>(2)?,
                offset: row.get::<_, i64>(3)?,
                created_at: row.get::<_, i64>(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM bookmarks WHERE id = ?1",
            params![id],
        )?;
        Ok(count > 0)
    }

    pub fn delete_by_book(&self, book_id: &str) -> rusqlite::Result<i64> {
        Ok(self.db.conn().execute(
            "DELETE FROM bookmarks WHERE book_id = ?1",
            params![book_id],
        )? as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("in-memory db")
    }

    fn insert_test_book(db: &Database, book_id: &str) {
        let book = Book {
            book_url: book_id.into(),
            name: "Test".into(),
            author: "".into(),
            cover_url: "".into(),
            source_url: "".into(),
            toc_url: "".into(),
            last_read_at: 0,
            group_id: None,
            book_type: 0,
            intro: "".into(),
        };
        BookRepo::new(db).upsert(&book).unwrap();
    }

    #[test]
    fn bookmark_upsert_and_list() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);
        insert_test_book(&db, "book-1");

        let bm = Bookmark {
            id: 0,
            book_id: "book-1".into(),
            chapter_index: 0,
            offset: 0,
            created_at: 1000,
        };

        let id = repo.upsert(&bm).unwrap();
        assert!(id > 0);

        let all = repo.list_by_book("book-1").unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].book_id, "book-1");
    }

    #[test]
    fn bookmark_list_by_book() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);
        insert_test_book(&db, "book-1");

        let bm1 = Bookmark {
            id: 0,
            book_id: "book-1".into(),
            chapter_index: 1,
            offset: 200,
            created_at: 1000,
        };
        let bm2 = Bookmark {
            id: 0,
            book_id: "book-1".into(),
            chapter_index: 3,
            offset: 0,
            created_at: 2000,
        };
        repo.upsert(&bm1).unwrap();
        repo.upsert(&bm2).unwrap();

        let all = repo.list_by_book("book-1").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn bookmark_delete() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);
        insert_test_book(&db, "book-x");

        let bm = Bookmark {
            id: 0,
            book_id: "book-x".into(),
            chapter_index: 0,
            offset: 0,
            created_at: 0,
        };
        let id = repo.upsert(&bm).unwrap();
        assert!(repo.delete(id).unwrap());
        assert!(!repo.delete(id).unwrap());
        assert_eq!(repo.list_by_book("book-x").unwrap().len(), 0);
    }

    #[test]
    fn bookmark_delete_by_book() {
        let db = test_db();
        let repo = BookmarkRepo::new(&db);
        insert_test_book(&db, "book-y");

        let bm = Bookmark {
            id: 0,
            book_id: "book-y".into(),
            chapter_index: 0,
            offset: 0,
            created_at: 0,
        };
        repo.upsert(&bm).unwrap();
        repo.upsert(&bm).unwrap();

        let deleted = repo.delete_by_book("book-y").unwrap();
        assert_eq!(deleted, 2);
        assert_eq!(repo.list_by_book("book-y").unwrap().len(), 0);
    }
}
