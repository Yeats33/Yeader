use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use yeader_library::Database;

/// Application state holding the SQLite database and logging resources.
/// Arc<Mutex<Database>> allows safe sharing across threads (required by Tauri).
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    /// Path to the log directory (e.g. ~/.yeader/logs).
    #[allow(dead_code)]
    pub log_dir: PathBuf,
    /// Path to the app data directory (e.g. ~/.yeader/).
    pub app_dir: PathBuf,
}

impl AppState {
    pub fn new(db: Database, log_dir: PathBuf, app_dir: PathBuf) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
            log_dir,
            app_dir,
        }
    }
}
