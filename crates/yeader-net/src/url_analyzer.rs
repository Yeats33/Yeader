//! URL analyzer for legado searchUrl format.
//!
//! Handles variable substitution, JS evaluation, and URL options parsing.
//! Corresponds to `AnalyzeUrl.kt` from legado.

use std::collections::HashMap;

use http::header::{HeaderName, HeaderValue};
use percent_encoding::NON_ALPHANUMERIC;
use regex::Regex;
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
    #[error("JS evaluation failed: {0}")]
    JsError(String),
}

pub type Result<T> = std::result::Result<T, UrlAnalyzerError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Method {
    GET,
    POST,
    HEAD,
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

/// Evaluate a JS expression using rhai.
fn eval_js_expr(js_str: &str, result: Option<&str>, key: Option<&str>, page: Option<i32>) -> String {
    let engine = rhai::Engine::new();
    let mut scope = rhai::Scope::new();

    if let Some(res) = result {
        scope.push("result", res.to_string());
    }
    if let Some(k) = key {
        scope.push("key", k.to_string());
    }
    if let Some(p) = page {
        scope.push("page", p);
    }
    scope.push("baseUrl", String::new());

    match engine.eval_with_scope::<String>(&mut scope, js_str) {
        Ok(output) => output,
        Err(e) => {
            eprintln!("JS eval error: {e}");
            String::new()
        }
    }
}

/// Analyze a legado-formatted search URL.
///
/// Handles:
/// - JS evaluation: `@js:...` and `<js>...</js>` blocks
/// - Variable substitution: `{{key}}` → keyword, `<1,2,3>` → page number
/// - JS template expansion: `{{js_expr}}` using balanced-brace counting
/// - URL options after comma: `{"method":"POST","body":"key={{key}}"}`
pub fn analyze_url(raw: &str, key: &str, page: i32, _base_url: &str) -> Result<AnalyzedUrl> {
    // Step 1: JS evaluation (analyzeJs) - handle @js: and <js>...</js> blocks
    let rule_url = analyze_js(raw, key, page)?;

    // Step 2: Variable substitution (replaceKeyPageJs)
    let url_with_vars = substitute_variables(&rule_url, key, page)?;

    // Step 3: URL option parsing (analyzeUrl)
    parse_url_with_options(&url_with_vars, key, page)
}

/// Step 1: Evaluate JS blocks in the URL string.
/// Corresponds to `AnalyzeUrl.analyzeJs()` (lines 162-185).
fn analyze_js(raw: &str, key: &str, page: i32) -> Result<String> {
    // Pattern: @js:... or <js>...</js>
    static JS_SHORT_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static JS_LONG_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

    let js_short_re = JS_SHORT_PATTERN.get_or_init(|| Regex::new(r"@js:([^\s@]+)").unwrap());
    let js_long_re = JS_LONG_PATTERN.get_or_init(|| Regex::new(r"<js>(.*?)</js>").unwrap());

    let mut result = raw.to_string();
    let mut last_evaluated = String::new();

    // Process short @js: blocks
    for cap in js_short_re.captures_iter(raw) {
        if let Some(js_expr) = cap.get(1) {
            let js_str = js_expr.as_str().trim();
            let eval_result = eval_js_expr(js_str, Some(&last_evaluated), Some(key), Some(page));
            last_evaluated = eval_result.clone();
            result = result.replace(&format!("@js:{js_str}"), &eval_result);
        }
    }

    // Process long <js>...</js> blocks
    for cap in js_long_re.captures_iter(raw) {
        if let Some(js_expr) = cap.get(1) {
            let js_str = js_expr.as_str().trim();
            let eval_result = eval_js_expr(js_str, Some(&last_evaluated), Some(key), Some(page));
            last_evaluated = eval_result.clone();
            result = result.replace(&format!("<js>{js_str}</js>"), &eval_result);
        }
    }

    Ok(result)
}

/// Step 2: Substitute variables in URL string.
/// Handles:
/// - `{{key}}` → keyword
/// - `<1,2,3>` → page number (1-indexed)
/// - `{{js_expr}}` → JS evaluation with balanced-brace counting
/// Corresponds to `AnalyzeUrl.replaceKeyPageJs()` (lines 190-217).
fn substitute_variables(input: &str, key: &str, page: i32) -> Result<String> {
    let mut result = input.to_string();

    // JS template expansion using balanced-brace counting (innerRule)
    // Handles {{...}} where ... may contain nested braces or JS expressions
    result = expand_inner_rule(&result, |js_expr| {
        let eval_result = eval_js_expr(js_expr, None, Some(key), Some(page));
        // Format numbers without decimal places
        if let Ok(num) = eval_result.parse::<f64>() {
            if num.fract() == 0.0 {
                format!("{:.0}", num)
            } else {
                eval_result
            }
        } else {
            eval_result
        }
    })?;

    // Substitute {{key}} with the keyword
    result = result.replace("{{key}}", key);

    // Substitute page number placeholders: <1,2,3> or <page>
    result = substitute_page_number(&result, page);

    Ok(result)
}

/// Expand `{{...}}` JS expressions using balanced-brace counting.
/// Corresponds to `RuleAnalyzer.innerRule()` with `chompCodeBalanced` (lines 308-332).
fn expand_inner_rule<F>(input: &str, mut eval_fn: F) -> Result<String>
where
    F: FnMut(&str) -> String,
{
    let mut result = String::new();
    let mut start_pos = 0;
    let chars: Vec<char> = input.chars().collect();

    while start_pos < chars.len() {
        // Find the next `{{`
        let Some(next_start) = find_sequence(&chars[start_pos..], "{{") else {
            result.push_str(&chars[start_pos..].iter().collect::<String>());
            break;
        };

        let absolute_start = start_pos + next_start;

        // Push everything before `{{`
        result.push_str(&chars[start_pos..absolute_start].iter().collect::<String>());

        // Find the matching `}}` using balanced-brace counting
        let js_expr = extract_balanced_braces(&chars, absolute_start + 2, '{', '}');

        if let Some((expr_content, end_pos)) = js_expr {
            // Evaluate the JS expression
            let eval_result = eval_fn(&expr_content);
            result.push_str(&eval_result);
            start_pos = end_pos + 2; // Skip the closing `}}`
        } else {
            // No matching `}}` found, treat `{{` as literal text
            result.push_str("{{");
            start_pos = absolute_start + 2;
        }
    }

    Ok(result)
}

/// Find a sequence in character array.
fn find_sequence(chars: &[char], seq: &str) -> Option<usize> {
    let seq_chars: Vec<char> = seq.chars().collect();
    if seq_chars.len() > chars.len() {
        return None;
    }

    for i in 0..=(chars.len() - seq_chars.len()) {
        if chars[i..].starts_with(&seq_chars) {
            return Some(i);
        }
    }
    None
}

/// Extract balanced braces content, returning (content, end_position).
/// Uses balanced-brace counting that respects quotes and escaping.
/// Corresponds to `chompCodeBalanced` in `RuleAnalyzer.kt` (lines 91-126).
fn extract_balanced_braces(chars: &[char], start: usize, open: char, close: char) -> Option<(String, usize)> {
    let len = chars.len();
    let mut pos = start;
    let mut depth = 0;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let expr_start = pos;

    while pos < len {
        let c = chars[pos];

        if c == '\\' && pos + 1 < len {
            // Escape character - skip next character
            pos += 2;
            continue;
        }

        // Handle quotes (balanced braces don't apply inside quotes)
        if c == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            pos += 1;
            continue;
        }
        if c == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            pos += 1;
            continue;
        }

        // If inside quotes, continue
        if in_single_quote || in_double_quote {
            pos += 1;
            continue;
        }

        // Count braces only when outside quotes
        if c == open {
            depth += 1;
        } else if c == close {
            if depth == 0 {
                // Found closing brace at depth 0
                let content: String = chars[expr_start..pos].iter().collect();
                return Some((content, pos));
            }
            depth -= 1;
        }

        pos += 1;
    }

    None
}

/// Step 3: Parse URL and URL options.
/// Corresponds to `AnalyzeUrl.analyzeUrl()` (lines 222-286).
fn parse_url_with_options(url_with_options: &str, key: &str, page: i32) -> Result<AnalyzedUrl> {
    // Split URL from options (comma-separated JSON after the URL)
    let (url_part, options_part) = split_url_options(url_with_options);

    // Parse URL options if present
    let options: Option<UrlOptions> = if let Some(opts) = options_part {
        // Try strict parsing first, then lenient
        serde_json::from_str(opts)
            .or_else(|_| serde_json::from_str(opts.trim()))
            .map_err(UrlAnalyzerError::InvalidJson)
            .ok()
    } else {
        None
    };

    // Determine method
    let method = options
        .as_ref()
        .and_then(|o| o.method.as_deref())
        .map(|m| match m.to_uppercase().as_str() {
            "POST" => Method::POST,
            "HEAD" => Method::HEAD,
            _ => Method::GET,
        })
        .unwrap_or(Method::GET);

    // Substitute variables in URL
    let url = substitute_url_variables(&url_part, key, page);

    // Extract body (with variable substitution)
    let body = options
        .as_ref()
        .and_then(|o| o.body.as_ref())
        .map(|b| substitute_url_variables(b, key, page));

    // Extract charset
    let charset = options
        .as_ref()
        .and_then(|o| o.content_type.as_deref())
        .or_else(|| options.as_ref().and_then(|o| o.charset.as_deref()))
        .and_then(|ct| extract_charset_from_content_type(ct));

    // Build headers
    let mut headers = HeaderMap::new();
    if let Some(ref ct) = options.as_ref().and_then(|o| o.content_type.clone()) {
        if let Ok(value) = ct.parse::<HeaderValue>() {
            headers.insert(HeaderName::from_static("content-type"), value);
        }
    }
    if let Some(ref hs) = options.as_ref().and_then(|o| o.headers.clone()) {
        for (k, v) in hs {
            if let (Ok(name), Ok(val)) = (k.parse::<HeaderName>(), v.parse::<HeaderValue>()) {
                headers.insert(name, val);
            }
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

/// Encode a string for use in a URL query component (RFC 3986).
fn encode_url_component(s: &str) -> String {
    use percent_encoding::NON_ALPHANUMERIC;
    percent_encoding::percent_encode(s.as_bytes(), NON_ALPHANUMERIC)
        .to_string()
}

/// Substitute variables in a URL string (no JS expansion, just key/page).
fn substitute_url_variables(input: &str, key: &str, page: i32) -> String {
    let mut result = input.to_string();

    // Substitute {{key}} with the keyword (URL encoded)
    result = result.replace("{{key}}", &encode_url_component(key));

    // Substitute page number placeholders
    result = substitute_page_number(&result, page);

    result
}

/// Split URL from URL options (comma-separated JSON after the URL).
/// The comma is only considered a split point if it's not inside braces or quotes.
/// Corresponds to `AnalyzeUrl.paramPattern` (line 768: `,\s*(?=\{)`).
fn split_url_options(raw: &str) -> (&str, Option<&str>) {
    let mut in_brace: i32 = 0;
    let mut in_quote: Option<char> = None;
    let chars = raw.char_indices().peekable();

    for (i, c) in chars {
        match c {
            '{' if in_quote.is_none() => in_brace += 1,
            '}' if in_quote.is_none() => in_brace -= 1,
            '"' | '\'' if in_brace == 0 => {
                if in_quote == Some(c) {
                    in_quote = None;
                } else if in_quote.is_none() {
                    in_quote = Some(c);
                }
            }
            ',' if in_brace == 0 && in_quote.is_none() => {
                return (&raw[..i], Some(&raw[i + 1..].trim_start()));
            }
            _ => {}
        }
    }

    (raw, None)
}

/// Substitute page number placeholders: `<1,2,3>` or just `<page>`.
/// The placeholder format is `<start,end>` or just `<page>`.
/// For URLs, we use the actual page number.
/// Corresponds to `AnalyzeUrl.pagePattern` (line 769: `<(.*?)>`).
fn substitute_page_number(input: &str, page: i32) -> String {
    static PAGE_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let page_re = PAGE_PATTERN.get_or_init(|| Regex::new(r"<([^>]+)>").unwrap());

    page_re
        .replace_all(input, |caps: &regex::Captures| {
            let inner = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let pages: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();

            if pages.len() == 1 {
                // Single value: use the page number directly
                page.to_string()
            } else {
                // Multiple values: use page as 1-indexed index
                let pages_len = pages.len() as i32;
                let page_idx = (page - 1).min(pages_len - 1).max(0) as usize;
                pages.get(page_idx).unwrap_or(&pages.last().unwrap_or(&"")).to_string()
            }
        })
        .to_string()
}

/// URL options parsed from the JSON suffix after the URL.
/// Corresponds to `AnalyzeUrl.UrlOption` (lines 781-957).
#[derive(Debug, Deserialize, Default)]
struct UrlOptions {
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(rename = "contentType", alias = "contentType", default)]
    content_type: Option<String>,
    #[serde(default)]
    charset: Option<String>,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    #[serde(rename = "type")]
    type_field: Option<String>,
    #[serde(default)]
    retry: Option<i32>,
    #[serde(default)]
    web_view: Option<bool>,
    #[serde(default)]
    web_js: Option<String>,
    #[serde(default)]
    dns_ip: Option<String>,
    #[serde(default)]
    js: Option<String>,
    #[serde(default)]
    body_js: Option<String>,
    #[serde(default)]
    server_id: Option<i64>,
    #[serde(default)]
    web_view_delay_time: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_key_variable() {
        let r = analyze_url("https://x.com/search?key={{key}}", "rust", 1, "").unwrap();
        assert_eq!(r.url, "https://x.com/search?key=rust");
    }

    #[test]
    fn replaces_page_variable() {
        let r = analyze_url("https://x.com/list?page=<1,2,3>", "test", 2, "").unwrap();
        assert_eq!(r.url, "https://x.com/list?page=2");
    }

    #[test]
    fn parses_post_with_json_body() {
        let raw = r#"https://x.com/api,{"method":"POST","body":"k={{key}}"}"#;
        let r = analyze_url(raw, "test", 1, "").unwrap();
        assert_eq!(r.url, "https://x.com/api");
        assert!(matches!(r.method, Method::POST));
    }

    #[test]
    fn evaluates_js_template_in_url() {
        // Note: This tests the innerRule JS evaluation (rhai uses double quotes)
        let raw = r#"https://x.com/{{ "test" }}"#;
        let r = analyze_url(raw, "", 1, "").unwrap();
        assert!(r.url.starts_with("https://x.com/test"));
    }

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
        let result = substitute_page_number("<1,2,3>", 5);
        // Page 5 should use last option (pages.len() = 3, page 5 -> index 2)
        assert_eq!(result, "3");
    }

    #[test]
    fn substitute_page_number_at_start() {
        let result = substitute_page_number("<1,2,3>", 1);
        assert_eq!(result, "1");
    }

    #[test]
    fn split_url_options_basic() {
        let (url, opts) = split_url_options("https://x.com/api, {\"method\":\"POST\"}");
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some("{\"method\":\"POST\"}"));
    }

    #[test]
    fn split_url_options_no_options() {
        let (url, opts) = split_url_options("https://x.com/search?q=test");
        assert_eq!(url, "https://x.com/search?q=test");
        assert!(opts.is_none());
    }

    #[test]
    fn split_url_options_comma_in_json_value() {
        let raw = r#"https://x.com/api, {"body":"a,b,c"}"#;
        let (url, opts) = split_url_options(raw);
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some(r#"{"body":"a,b,c"}"#));
    }

    #[test]
    fn split_url_options_nested_braces() {
        let raw = r#"https://x.com/api, {"data":{"a":1,"b":2}}"#;
        let (url, opts) = split_url_options(raw);
        assert_eq!(url, "https://x.com/api");
        assert_eq!(opts, Some(r#"{"data":{"a":1,"b":2}}"#));
    }

    #[test]
    fn analyze_js_short_block() {
        let raw = "https://x.com/@js:result + '1'/search";
        let result = analyze_js(raw, "", 1).unwrap();
        assert!(result.contains("1"));
    }

    #[test]
    fn analyze_js_long_block() {
        let raw = "https://x.com/<js>result + '1'</js>/search";
        let result = analyze_js(raw, "", 1).unwrap();
        assert!(result.contains("1"));
    }

    #[test]
    fn expand_inner_rule_simple() {
        let result = expand_inner_rule("Hello {{ 'World' }}!", |_| "World".to_string()).unwrap();
        assert_eq!(result, "Hello World!");
    }

    #[test]
    fn expand_inner_rule_nested() {
        // Nested braces in JS expression should be handled correctly
        let result = expand_inner_rule("{{ [1, {a:2}][0] }}", |_| "1".to_string()).unwrap();
        assert_eq!(result, "1");
    }

    #[test]
    fn expand_inner_rule_no_match() {
        let result = expand_inner_rule("No template here", |_| "X".to_string()).unwrap();
        assert_eq!(result, "No template here");
    }

    #[test]
    fn encode_url_component_simple() {
        assert_eq!(encode_url_component("hello world"), "hello%20world");
    }

    #[test]
    fn encode_url_component_special() {
        assert_eq!(encode_url_component("a=b,c"), "a%3Db%2Cc");
    }

    #[test]
    fn eval_js_expr_basic() {
        // rhai uses double quotes for strings
        let result = eval_js_expr("\"hello\" + \" world\"", None, None, None);
        assert_eq!(result, "hello world");
    }

    #[test]
    fn eval_js_expr_with_result() {
        let result = eval_js_expr("result + \" appended\"", Some("base"), None, None);
        assert_eq!(result, "base appended");
    }

    #[test]
    fn eval_js_expr_with_key() {
        let result = eval_js_expr("key + \" test\"", None, Some("mykey"), None);
        assert_eq!(result, "mykey test");
    }
}