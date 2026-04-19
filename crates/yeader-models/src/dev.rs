use serde::{Deserialize, Serialize};

/// A single log entry parsed from tracing-subscriber JSON Lines output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    pub timestamp: String,
    pub level: String,
    /// Maps from tracing-subscriber's "target" field.
    pub target: String,
    pub message: String,
}

/// Dev mode status returned to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevModeStatus {
    pub enabled: bool,
    pub available: bool,
}
