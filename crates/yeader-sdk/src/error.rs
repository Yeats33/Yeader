use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type PluginResult<T> = Result<T, PluginError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Error)]
pub enum PluginError {
    #[error("feature not supported")]
    NotSupported,
    #[error("network error: {0}")]
    Network(String),
    #[error("parse error: {0}")]
    Parse(String),
    #[error("auth error: {0}")]
    Auth(String),
    #[error("api error code={code}: {message}")]
    Api { code: i64, message: String },
    #[error("decryption error: {0}")]
    Decryption(String),
    #[error("scramble error: {0}")]
    Scramble(String),
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
    #[error("{0}")]
    Other(String),
}

impl PluginError {
    pub fn other(msg: impl Into<String>) -> Self {
        PluginError::Other(msg.into())
    }
}
