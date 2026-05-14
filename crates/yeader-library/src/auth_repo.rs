use rusqlite::params;

use crate::Database;

#[derive(Debug, Clone)]
pub struct AuthSession {
    pub wallet_address: String,
    pub chain_id: i64,
    pub created_at: String,
    pub expires_at: String,
}

pub struct AuthRepo<'a> {
    db: &'a Database,
}

impl<'a> AuthRepo<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn save_session(&self, session: &AuthSession) -> rusqlite::Result<()> {
        self.db.conn().execute(
            "INSERT INTO auth_sessions (wallet_address, chain_id, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(wallet_address) DO UPDATE SET
                chain_id = excluded.chain_id,
                created_at = excluded.created_at,
                expires_at = excluded.expires_at",
            params![
                session.wallet_address,
                session.chain_id,
                session.created_at,
                session.expires_at,
            ],
        )?;
        Ok(())
    }

    pub fn find_valid_session(&self) -> rusqlite::Result<Option<AuthSession>> {
        let mut stmt = self.db.conn().prepare(
            "SELECT wallet_address, chain_id, created_at, expires_at
             FROM auth_sessions
             WHERE expires_at > datetime('now')
             ORDER BY created_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query_map([], |row| {
            Ok(AuthSession {
                wallet_address: row.get(0)?,
                chain_id: row.get(1)?,
                created_at: row.get(2)?,
                expires_at: row.get(3)?,
            })
        })?;
        rows.next().transpose()
    }

    pub fn clear_session(&self) -> rusqlite::Result<()> {
        self.db
            .conn()
            .execute("DELETE FROM auth_sessions", [])?;
        Ok(())
    }

    pub fn save_nonce(&self, nonce: &str, expires_at: &str) -> rusqlite::Result<()> {
        self.db.conn().execute(
            "INSERT INTO auth_nonces (nonce, created_at, expires_at)
             VALUES (?1, datetime('now'), ?2)",
            params![nonce, expires_at],
        )?;
        Ok(())
    }

    pub fn consume_nonce(&self, nonce: &str) -> rusqlite::Result<bool> {
        let count = self.db.conn().execute(
            "DELETE FROM auth_nonces WHERE nonce = ?1 AND expires_at > datetime('now')",
            params![nonce],
        )?;
        Ok(count > 0)
    }

    pub fn cleanup_expired_nonces(&self) -> rusqlite::Result<usize> {
        self.db.conn().execute(
            "DELETE FROM auth_nonces WHERE expires_at <= datetime('now')",
            [],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        Database::open_in_memory().expect("in-memory db")
    }

    #[test]
    fn session_save_and_find() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        let session = AuthSession {
            wallet_address: "0xabc".into(),
            chain_id: 1,
            created_at: "2026-01-01T00:00:00Z".into(),
            expires_at: "2099-01-01T00:00:00Z".into(),
        };
        repo.save_session(&session).unwrap();

        let found = repo.find_valid_session().unwrap().unwrap();
        assert_eq!(found.wallet_address, "0xabc");
        assert_eq!(found.chain_id, 1);
    }

    #[test]
    fn session_upsert_replaces_old() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        repo.save_session(&AuthSession {
            wallet_address: "0xabc".into(),
            chain_id: 1,
            created_at: "2026-01-01T00:00:00Z".into(),
            expires_at: "2099-01-01T00:00:00Z".into(),
        })
        .unwrap();

        repo.save_session(&AuthSession {
            wallet_address: "0xabc".into(),
            chain_id: 137,
            created_at: "2026-06-01T00:00:00Z".into(),
            expires_at: "2099-06-01T00:00:00Z".into(),
        })
        .unwrap();

        let found = repo.find_valid_session().unwrap().unwrap();
        assert_eq!(found.chain_id, 137);
    }

    #[test]
    fn expired_session_not_found() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        repo.save_session(&AuthSession {
            wallet_address: "0xabc".into(),
            chain_id: 1,
            created_at: "2020-01-01T00:00:00Z".into(),
            expires_at: "2020-01-02T00:00:00Z".into(),
        })
        .unwrap();

        assert!(repo.find_valid_session().unwrap().is_none());
    }

    #[test]
    fn nonce_consume_once() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        repo.save_nonce("test-nonce", "2099-01-01T00:00:00Z").unwrap();
        assert!(repo.consume_nonce("test-nonce").unwrap());
        assert!(!repo.consume_nonce("test-nonce").unwrap());
    }

    #[test]
    fn expired_nonce_not_consumed() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        repo.save_nonce("expired", "2000-01-01T00:00:00Z").unwrap();
        assert!(!repo.consume_nonce("expired").unwrap());
    }

    #[test]
    fn clear_session_removes_all() {
        let db = test_db();
        let repo = AuthRepo::new(&db);

        repo.save_session(&AuthSession {
            wallet_address: "0xabc".into(),
            chain_id: 1,
            created_at: "2026-01-01T00:00:00Z".into(),
            expires_at: "2099-01-01T00:00:00Z".into(),
        })
        .unwrap();

        repo.clear_session().unwrap();
        assert!(repo.find_valid_session().unwrap().is_none());
    }
}
