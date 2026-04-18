//! URL analyzer for legado searchUrl format.
//!
//! Handles variable substitution and URL options parsing.

use http::header::{HeaderName, HeaderValue};
use reqwest::header::HeaderMap;
use serde::Deserialize;
use thiserror::Error;

use crate::encoding::extract_charset_from_content_type;

#[derive(Error, Debug)]
pub enum UrlAnalyzerError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("Invalid JSON in URL options: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("Missing required field: {0}")]
    MissingField(String),
}

pub type Result<T> = std::result::Result<T, UrlAnalyzerError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Method {
    GET,
    POST,
}

impl Default for Method {
    fn default() -> Self {
        Method::GET
    }
}

#[derive(Debug, Clone, Default)]
pub struct AnalyzedUrl {
    pub url: String,
    pub method: Method,
    pub headers: HeaderMap,
    pub body: Option<String>,
    pub charset: Option<String>,
}

/// Analyze a legado-formatted search URL.
///
/// Handles:
/// - Variable substitution: `{{key}}` → keyword, `<1,2>` → page number
/// - URL options after comma: `{"method":"POST","body":"key={{key}}"}`
pub fn analyze_url(raw: &str, key: &str, page: i32, _base_url: &str) -> Result<AnalyzedUrl> {
    // Split URL from options (comma-separated JSON after the URL)
    let (url_part, options_part) = split_url_options(raw);

    // Parse URL options if present
    let options: Option<UrlOptions> = if let Some(opts) = options_part {
        Some(serde_json::from_str(opts).map_err(UrlAnalyzerError::InvalidJson)?)
    } else {
        None
    };

    // Determine method
    let method = options
        .as_ref()
        .and_then(|o| o.method.as_deref())
        .map(|m| match m.to_uppercase().as_str() {
            "POST" => Method::POST,
            _ => Method::GET,
        })
        .unwrap_or(Method::GET);

    // Substitute variables in URL
    let url = substitute_variables(&url_part, key, page);

    // Extract body (with variable substitution)
    let body = options
        .as_ref()
        .and_then(|o| o.body.as_ref())
        .map(|b| substitute_variables(b, key, page));

    // Extract charset
    let charset = options
        .as_ref()
        .and_then(|o| o.content_type.as_deref())
        .and_then(|ct| extract_charset_from_content_type(ct));

    // Build headers
    let mut headers = HeaderMap::new();
    if let Some(ref ct) = options.as_ref().and_then(|o| o.content_type.clone()) {
        if let Ok(value) = ct.parse::<HeaderValue>() {
            headers.insert(HeaderName::from_static("content-type"), value);
        }
    }

    Ok(AnalyzedUrl {
        url,
        method,
        headers,
        body,
        charset,
    })
}

fn split_url_options(raw: &str) -> (&str, Option<&str>) {
    // Find the first comma that is NOT inside braces or quotes
    let mut in_brace: i32 = 0;
    let mut in_quote = false;
    let chars = raw.char_indices().peekable();
    let mut chars_iter = chars.fuse();

    while let Some((i, c)) = chars_iter.next() {
        match c {
            '{' if !in_quote => in_brace += 1,
            '}' if !in_quote => in_brace -= 1,
            '"' => in_quote = !in_quote,
            ',' if in_brace == 0 && !in_quote => {
                return (&raw[..i], Some(&raw[i + 1..]));
            }
            _ => {}
        }
    }

    (raw, None)
}

fn substitute_variables(input: &str, key: &str, page: i32) -> String {
    let mut result = input.to_string();

    // Substitute {{key}} with the keyword
    result = result.replace("{{key}}", key);

    // Substitute <1,2> with page number (handles <1,2> where 1 is start page, 2 is end page or just page)
    // legado uses <page> or <start,end>
    result = substitute_page_number(&result, page);

    result
}

fn substitute_page_number(input: &str, page: i32) -> String {
    let mut result = String::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '<' {
            // Look for closing >
            let start = i + 1;
            let mut end = start;
            let mut found_comma = false;

            while end < chars.len() {
                if chars[end] == ',' && !found_comma {
                    found_comma = true;
                } else if chars[end] == '>' {
                    break;
                }
                end += 1;
            }

            if end < chars.len() && chars[end] == '>' {
                // Both <page> and <start,end> use actual page number for URL
                result.push_str(&page.to_string());
                i = end + 1;
            } else {
                result.push(chars[i]);
                i += 1;
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }

    result
}

#[derive(Debug, Deserialize)]
struct UrlOptions {
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(rename = "contentType", alias = "contentType", default)]
    content_type: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_url_with_key() {
        let r = analyze_url("https://x.com/search?q={{key}}", "rust", 1, "").unwrap();
        assert_eq!(r.url, "https://x.com/search?q=rust");
        assert!(matches!(r.method, Method::GET));
        assert!(r.body.is_none());
    }

    #[test]
    fn parses_post_url_with_options() {
        let raw = r#"https://x.com/api, {"method":"POST","body":"keyword={{key}}&page=<1,2>"}"#;
        let r = analyze_url(raw, "test", 2, "").unwrap();
        assert_eq!(r.url, "https://x.com/api");
        assert!(matches!(r.method, Method::POST));
        assert_eq!(r.body.as_deref(), Some("keyword=test&page=2"));
    }

    #[test]
    fn parses_url_with_charset() {
        let raw = r#"https://x.com/api, {"method":"POST","contentType":"application/json; charset=UTF-8"}"#;
        let r = analyze_url(raw, "test", 1, "").unwrap();
        assert_eq!(r.charset.as_deref(), Some("UTF-8"));
    }

    #[test]
    fn substitute_page_number_simple() {
        let result = substitute_page_number("<1>", 5);
        assert_eq!(result, "5");
    }

    #[test]
    fn substitute_page_number_with_comma() {
        // <1,2> should use the actual page number for URL substitution
        let result = substitute_page_number("<1,2>", 5);
        assert_eq!(result, "5");
    }

    #[test]
    fn substitute_variables_with_keyword() {
        let result = substitute_variables("{{key}}", "rust", 1);
        assert_eq!(result, "rust");
    }

    #[test]
    fn substitute_variables_with_page() {
        let result = substitute_variables("<1>", "keyword", 3);
        assert_eq!(result, "3");
    }

    #[test]
    fn split_url_options_basic() {
        let (url, opts) = split_url_options("https://x.com/api, {\"method\":\"POST\"}");
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some(" {\"method\":\"POST\"}"));
    }

    #[test]
    fn split_url_options_no_options() {
        let (url, opts) = split_url_options("https://x.com/search?q=test");
        assert_eq!(url, "https://x.com/search?q=test");
        assert!(opts.is_none());
    }

    #[test]
    fn split_url_options_comma_in_json_value() {
        // Comma inside quoted string should not split
        let raw = r#"https://x.com/api, {"body":"a,b,c"}"#;
        let (url, opts) = split_url_options(raw);
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some(r#" {"body":"a,b,c"}"#));
    }

    #[test]
    fn split_url_options_nested_braces() {
        // Comma inside braces should not split
        let raw = r#"https://x.com/api, {"data":{"a":1,"b":2}}"#;
        let (url, opts) = split_url_options(raw);
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some(r#" {"data":{"a":1,"b":2}}"#));
    }
}