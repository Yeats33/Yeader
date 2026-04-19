//! Tauri application entry point.

mod commands;
mod logging;
mod state;

use commands::{dev, library, reader, search};
use state::AppState;
use tauri::Manager;
use yeader_library::Database;

/// Keep the log guard alive for the entire program lifetime.
/// Leaking is intentional — the guard must not be dropped until exit.
static LOG_GUARD: std::sync::OnceLock<Box<dyn std::any::Any + Send + Sync>> =
    std::sync::OnceLock::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;

            // Initialize logging first — must happen before any other logging.
            let log_dir = logging::log_dir(&app_dir);
            let guard = logging::init_logging(log_dir.clone())?;
            // Leak the guard so it lives for the entire program duration.
            let _ = LOG_GUARD.set(Box::new(guard));

            let db_path = app_dir.join("yeader.db");
            let db = Database::open(db_path.to_str().unwrap())
                .map_err(|e| format!("Failed to open database: {}", e))?;

            let state = AppState::new(db, log_dir);
            app.manage(state);

            tracing::info!("Yeader initialized successfully");

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_legado_import_uri,
            dev::get_dev_mode_status,
            dev::toggle_dev_mode,
            library::list_book_sources,
            library::load_book_sources_from_file,
            library::import_book_sources_json,
            library::import_book_sources_url,
            library::import_book_sources_subscription,
            library::list_replace_rules,
            library::list_rss_sources,
            library::delete_book_source,
            library::toggle_book_source,
            library::list_books,
            library::get_book,
            library::add_book_to_shelf,
            library::remove_book,
            library::get_reading_progress,
            library::save_reading_progress,
            search::search_books,
            search::test_book_sources_availability,
            reader::fetch_book_info,
            reader::fetch_toc,
            reader::fetch_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn parse_legado_import_uri(uri: &str) -> Result<yeader_models::CompatImportArtifact, String> {
    yeader_protocol::parse_legado_import_uri(uri).map_err(|error| error.to_string())
}
