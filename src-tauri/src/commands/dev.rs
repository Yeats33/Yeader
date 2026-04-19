//! Developer mode commands: dev mode toggle and status.

use std::sync::atomic::{AtomicBool, Ordering};
use yeader_models::DevModeStatus;

use crate::logging::IS_DEV_MODE_AVAILABLE;

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
