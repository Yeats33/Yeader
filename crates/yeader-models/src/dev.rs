use serde::{Deserialize, Serialize};

/// A single log entry, matching the JSON Lines format written to the log file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub timestamp: String,
    pub level: String,
    pub module: String,
    pub message: String,
}

/// Dev mode status returned to the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevModeStatus {
    pub enabled: bool,
    pub available: bool,
}
