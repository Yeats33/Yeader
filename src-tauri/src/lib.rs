mod commands;
mod state;

use commands::{library, reader, search};
use log::info;
use state::AppState;
use tauri::Manager;
use yeader_library::Database;
use yeader_models::CompatImportArtifact;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Yeader starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("yeader.db");
            let db = Database::open(db_path.to_str().unwrap())
                .map_err(|e| format!("Failed to open database: {}", e))?;
            app.manage(AppState::new(db));

            info!("Yeader initialized successfully");

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_legado_import_uri,
            library::list_book_sources,
            library::delete_book_source,
            library::list_books,
            library::add_book_to_shelf,
            library::remove_book,
            library::get_reading_progress,
            library::save_reading_progress,
            search::search_books,
            reader::fetch_book_info,
            reader::fetch_toc,
            reader::fetch_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn parse_legado_import_uri(uri: &str) -> Result<CompatImportArtifact, String> {
    yeader_protocol::parse_legado_import_uri(uri).map_err(|error| error.to_string())
}
