//! Tauri application entry point.

mod commands;
mod logging;
mod model;
mod state;
mod style;

use commands::{auth, backup, dev, integration, library, reader, search};
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
            let db_path_str = db_path
                .to_str()
                .ok_or_else(|| "Database path contains non-UTF-8 characters".to_string())?;
            let db = Database::open(db_path_str)
                .map_err(|e| format!("Failed to open database: {}", e))?;

            let state = AppState::new(db, log_dir, app_dir.clone());
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
            dev::get_dev_mode_status,
            dev::toggle_dev_mode,
            dev::get_log_lines,
            dev::open_log_file,
            backup::import_backup,
            integration::check_command_exists,
            integration::get_command_version,
            integration::open_url_cmd,
            integration::run_command,
            integration::start_so_novel_webui,
            integration::is_so_novel_running,
            integration::stop_so_novel,
            integration::get_so_novel_config,
            integration::save_so_novel_config,
            integration::reset_so_novel_config,
            integration::list_so_novel_rules,
            integration::import_so_novel_rule,
            integration::delete_so_novel_rule,
            integration::get_so_novel_active_rule,
            integration::set_so_novel_active_rule,
            library::list_yeader_sources,
            library::toggle_yeader_source,
            library::delete_yeader_source,
            library::import_yeader_source_pack_json,
            library::list_books,
            library::get_book,
            library::add_book_to_shelf,
            library::remove_book,
            library::get_reading_progress,
            library::save_reading_progress,
            search::search_books,
            search::list_explore_categories,
            search::explore_books,
            reader::fetch_book_info,
            reader::fetch_toc,
            reader::fetch_content,
            reader::import_epub,
            reader::import_epub_url,
            reader::list_local_epubs,
            reader::read_local_epub,
            reader::delete_local_epub,
            reader::get_epub_toc,
            reader::save_reader_style,
            reader::get_reader_style,
            reader::save_bookmark,
            reader::get_bookmark,
            auth::generate_auth_nonce,
            auth::verify_evm_auth,
            auth::get_auth_session,
            auth::clear_auth_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
