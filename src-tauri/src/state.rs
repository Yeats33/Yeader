use std::sync::{Arc, Mutex};
use yeader_library::Database;

/// Application state holding the SQLite database.
/// Arc<Mutex<Database>> allows safe sharing across threads (required by Tauri).
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
}

impl AppState {
    pub fn new(db: Database) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
        }
    }
}
