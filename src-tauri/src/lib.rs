//! Tauri application entry point.

mod commands;
mod state;

use commands::{backup, library, reader, search};
use state::SharedState;

use std::sync::Arc;
use tauri::Manager;
use yeader_library::Database;
use yeader_net::HttpClient;

const DB_PATH: &str = "yeader.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    info!("Yeader starting...");

    let db = Database::open(DB_PATH).expect("Failed to open database");
    let http_client = HttpClient::new().expect("Failed to create HTTP client");
    let app_state = Arc::new(state::AppState::new(db, http_client));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            parse_legado_import_uri,
            backup::import_backup,
            library::list_book_sources,
            library::list_replace_rules,
            library::list_rss_sources,
            library::list_books,
            library::add_book_to_shelf,
            library::remove_book,
            library::delete_book_source,
            search::search_books,
            reader::fetch_book_info,
            reader::fetch_toc,
            reader::fetch_content,
            reader::get_reading_progress,
            reader::save_reading_progress,
        ])
        .setup(|app| {
            info!("Yeader initialized successfully");
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn parse_legado_import_uri(uri: &str) -> Result<yeader_models::CompatImportArtifact, String> {
    yeader_protocol::parse_legado_import_uri(uri).map_err(|error| error.to_string())
}
