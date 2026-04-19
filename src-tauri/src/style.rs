use crate::model::ReaderStyle;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

/// Save reader style to JSON config file
pub async fn save_style_to_local_storage(
    app_handle: &AppHandle,
    style: &ReaderStyle,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to get app data directory: {}", e))?;

    let config_dir = app_dir.join("config");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let style_file_path = config_dir.join("reader_style.json");
    let json_data = serde_json::to_string(style)
        .map_err(|e| format!("Failed to serialize style: {}", e))?;

    fs::write(&style_file_path, json_data)
        .map_err(|e| format!("Failed to write style to file: {}", e))?;

    Ok(style_file_path.to_string_lossy().to_string())
}

/// Load reader style from JSON config file
pub async fn load_style_from_local_storage(app_handle: &AppHandle) -> Result<ReaderStyle, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to get app data directory: {}", e))?;

    let style_file_path = app_dir.join("config").join("reader_style.json");

    if !style_file_path.exists() {
        return Ok(ReaderStyle::default());
    }

    let json_data = fs::read_to_string(&style_file_path)
        .map_err(|e| format!("Failed to read style file: {}", e))?;

    let style: ReaderStyle = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to deserialize style: {}", e))?;

    Ok(style)
}