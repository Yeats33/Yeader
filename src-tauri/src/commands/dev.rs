//! Developer mode commands: dev mode toggle and status.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use yeader_models::DevModeStatus;

use crate::logging::{IS_DEV_MODE_AVAILABLE, info_log_path, log_dir};

/// Persistent toggle stored in process memory (reset on restart).
static DEV_MODE_ENABLED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, serde::Serialize)]
pub struct LogLine {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

#[tauri::command]
pub fn get_dev_mode_status() -> DevModeStatus {
    DevModeStatus {
        enabled: DEV_MODE_ENABLED.load(Ordering::SeqCst),
        available: IS_DEV_MODE_AVAILABLE,
    }
}

#[tauri::command]
pub fn toggle_dev_mode(enabled: bool) -> bool {
    DEV_MODE_ENABLED.store(enabled, Ordering::SeqCst);
    tracing::info!("Dev mode toggled to {}", enabled);
    enabled
}

#[tauri::command]
pub fn get_log_lines(app: AppHandle, limit: Option<usize>) -> Result<Vec<LogLine>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let log_path = info_log_path(&log_dir(&app_dir));

    let content = std::fs::read_to_string(&log_path).unwrap_or_default();
    let limit = limit.unwrap_or(200);

    let lines: Vec<LogLine> = content
        .lines()
        .rev()
        .take(limit)
        .filter_map(|line| {
            let v: serde_json::Value = serde_json::from_str(line).ok()?;
            Some(LogLine {
                timestamp: v["timestamp"].as_str().unwrap_or("").to_string(),
                level: v["level"].as_str().unwrap_or("").to_string(),
                target: v["target"].as_str().unwrap_or("").to_string(),
                message: v["fields"]["message"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    Ok(lines)
}

#[tauri::command]
pub fn open_log_file(app: AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let log_path = info_log_path(&log_dir(&app_dir));
    let path_str = log_path.to_string_lossy().to_string();
    tauri_plugin_opener::open_url(&path_str, None::<&str>)
        .map_err(|e| format!("Failed to open log file: {}", e))
}
