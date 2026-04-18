//! Tauri application state shared across all commands.

use std::sync::{Arc, Mutex};

use yeader_library::Database;
use yeader_net::HttpClient;

/// Application state holding singleton resources.
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub http_client: Arc<HttpClient>,
}

impl AppState {
    pub fn new(db: Database, http_client: HttpClient) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
            http_client: Arc::new(http_client),
        }
    }
}

pub type SharedState = Arc<AppState>;
