//! Book group entity and repository.

use rusqlite::params;

use crate::Database;

/// A book group / category.
#[derive(Debug, Clone, PartialEq)]
pub struct BookGroup {
    pub id: i64,
    pub name: String,
    pub sort_order: i32,
}

// ---------------------------------------------------------------------------
// BookGroupRepo
// ---------------------------------------------------------------------------

pub struct BookGroupRepo<'a> {
    db: &'a Database,
}

impl<'a> BookGroupRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn upsert(&self, group: &BookGroup) -> rusqlite::Result<()> {
        self.db.conn().execute(
            "INSERT INTO book_groups (id, name, sort_order)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                sort_order = excluded.sort_order",
            params![group.id, group.name, group.sort_order],
        )?;
        Ok(())
    }

    pub fn list_all(&self) -> rusqlite::Result<Vec<BookGroup>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT id, name, sort_order FROM book_groups ORDER BY sort_order, name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(BookGroup {
                id: row.get::<_, i64>(0)?,
                name: row.get(1)?,
                sort_order: row.get::<_, i32>(2)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_by_id(&self, id: i64) -> rusqlite::Result<Option<BookGroup>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT id, name, sort_order FROM book_groups WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(BookGroup {
                id: row.get::<_, i64>(0)?,
                name: row.get(1)?,
                sort_order: row.get::<_, i32>(2)?,
            })
        })?;
        rows.next().transpose()
    }

    pub fn delete(&self, id: i64) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM book_groups WHERE id = ?1",
            params![id],
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
    fn book_group_upsert_and_list() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        let group = BookGroup {
            id: 1,
            name: "Fiction".into(),
            sort_order: 0,
        };

        repo.upsert(&group).unwrap();
        let all = repo.list_all().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Fiction");
    }

    #[test]
    fn book_group_find_by_id() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        assert!(repo.find_by_id(1).unwrap().is_none());

        let group = BookGroup {
            id: 42,
            name: "Sci-Fi".into(),
            sort_order: 1,
        };
        repo.upsert(&group).unwrap();
        assert!(repo.find_by_id(42).unwrap().is_some());
    }

    #[test]
    fn book_group_delete() {
        let db = test_db();
        let repo = BookGroupRepo::new(&db);

        let group = BookGroup {
            id: 99,
            name: "ToDelete".into(),
            sort_order: 0,
        };
        repo.upsert(&group).unwrap();
        assert!(repo.delete(99).unwrap());
        assert!(!repo.delete(99).unwrap());
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }
}
