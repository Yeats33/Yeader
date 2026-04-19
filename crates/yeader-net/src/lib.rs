//! Networking helpers for Yeader.

pub mod client;
pub mod encoding;
pub mod url_analyzer;

pub use client::{HttpClient, HttpError, HttpResponse};
pub use url_analyzer::{analyze_url, AnalyzedUrl, Method};

use reqwest::header::HeaderMap;
use yeader_models::LegacyBookSource;

/// Build a `HeaderMap` from a `LegacyBookSource`.
pub fn header_map_from_source(_source: &LegacyBookSource) -> HeaderMap {
    HeaderMap::new()
}

/// Resolve a relative URL against a source's base URL.
/// If `input` is already absolute, returns it unchanged.
pub fn resolve_book_url(source: &LegacyBookSource, input: &str) -> String {
    if input.starts_with("http://") || input.starts_with("https://") {
        return input.to_string();
    }

    let base = source.book_source_url.trim_end_matches('/');
    if input.starts_with('/') {
        // Absolute path — prepend scheme+host
        if let Some(domain_end) = base.find("://").map(|i| base[i + 3..].find('/').map(|j| i + 3 + j)).flatten() {
            let host = &base[..domain_end];
            return format!("{}{}", host, input);
        }
        return format!("{}/{}", base, &input[1..]);
    }

    // Relative path
    let base = base.trim_end_matches('/');
    format!("{}/{}", base, input)
}