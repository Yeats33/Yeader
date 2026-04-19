//! JSON Lines file logging with daily rotation.
//!
//! Replaces `env_logger`. In debug builds logs to both stderr and file.
//! In release builds logs to file only.

use std::path::PathBuf;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

const LOG_DIR_NAME: &str = "logs";

/// Whether this is a debug/dev build (true) or release build (false).
pub const IS_DEV_MODE_AVAILABLE: bool = cfg!(debug_assertions);

/// Sets up the tracing subscriber with a JSON Lines file appender.
///
/// In dev mode: writes to both stderr and a daily-rotating log file at `log_dir/YYYY-MM-DD.log`.
/// In release mode: writes to the log file only.
///
/// Returns a `WorkerGuard` that must be held for the duration of the program
/// to ensure logs are flushed. The guard is stored in `AppState`.
pub fn init_logging(log_dir: PathBuf) -> Result<WorkerGuard, String> {
    std::fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {}", e))?;

    let file_appender = tracing_appender::rolling::daily(&log_dir, "yeader.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Determine the env filter: debug in dev mode, info otherwise.
    let env_filter = if IS_DEV_MODE_AVAILABLE {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"))
    } else {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
    };

    let json_layer = fmt::layer()
        .json()
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(true)
        .with_line_number(true)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(non_blocking);

    let stderr_layer = if IS_DEV_MODE_AVAILABLE {
        Some(
            fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .with_thread_names(false)
                .with_file(true)
                .with_line_number(true)
                .with_span_events(FmtSpan::CLOSE)
                .with_writer(std::io::stderr),
        )
    } else {
        None
    };

    tracing_subscriber::registry()
        .with(env_filter)
        .with(json_layer)
        .with(stderr_layer)
        .init();

    // Log the initialization at info level.
    tracing::info!(
        "Logging initialized (dev_mode_available={})",
        IS_DEV_MODE_AVAILABLE
    );

    Ok(guard)
}

/// Returns the log directory path for the given app data directory.
pub fn log_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join(LOG_DIR_NAME)
}
