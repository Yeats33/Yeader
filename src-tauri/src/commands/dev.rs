//! Developer mode commands: log viewing, dev mode toggle, and log file opening.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;
use yeader_models::{DevModeStatus, LogLine};

use crate::logging::IS_DEV_MODE_AVAILABLE;
use crate::AppState;

/// Persistent toggle stored in process memory (reset on restart).
static DEV_MODE_ENABLED: AtomicBool = AtomicBool::new(false);

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
pub fn get_log_lines(limit: Option<usize>, state: State<'_, AppState>) -> Result<Vec<LogLine>, String> {
    let log_path = log_file_path(&state.log_dir)?;
    read_log_lines(&log_path, limit.unwrap_or(200))
}

#[tauri::command]
pub fn open_log_file(state: State<'_, AppState>) -> Result<(), String> {
    let log_path = log_file_path(&state.log_dir)?;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&log_path)
            .spawn()
            .map_err(|e| format!("Failed to open log file: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = log_path;
        return Err("open_log_file not implemented for this platform".to_string());
    }
    Ok(())
}

fn log_file_path(log_dir: &PathBuf) -> Result<PathBuf, String> {
    let today = chrono_lite_date();
    let log_file = log_dir.join(format!("{}.log", today));
    Ok(log_file)
}

fn read_log_lines(path: &PathBuf, limit: usize) -> Result<Vec<LogLine>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let reader = BufReader::new(file);
    let lines: Vec<LogLine> = reader
        .lines()
        .filter_map(|line| {
            let line = line.ok()?;
            serde_json::from_str(&line).ok()
        })
        .collect();
    let start = lines.len().saturating_sub(limit);
    Ok(lines[start..].to_vec())
}

fn chrono_lite_date() -> String {
    // Returns YYYY-MM-DD using only std library.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let days_since_epoch = now.as_secs() / 86400;

    // Julian Day Number for 1970-01-01 is 2440588.
    let jd = 2440588i64 + days_since_epoch as i64;

    // Convert JDN to Gregorian date using Fliegel-Van Flandern.
    let l = jd + 68569;
    let n = (4 * l) / 146097;
    let l = l - (146097 * n + 3) / 4;
    let i = (4000 * (l + 1)) / 1461001;
    let l = l - (1461 * i) / 4 + 31;
    let j = (80 * l) / 2447;
    let day = (l - (2447 * j) / 80) as u8;
    let l = j / 11;
    let month = (j + 2 - 12 * l) as u8;
    let year = 100 * (n - 49) + i + l;

    format!("{:04}-{:02}-{:02}", year, month, day)
}
