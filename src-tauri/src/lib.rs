use log::info;
use tauri::Manager;
use yeader_models::CompatImportArtifact;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Yeader starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![parse_legado_import_uri])
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
fn parse_legado_import_uri(uri: &str) -> Result<CompatImportArtifact, String> {
    yeader_protocol::parse_legado_import_uri(uri).map_err(|error| error.to_string())
}
