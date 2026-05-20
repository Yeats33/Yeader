//! 功能型插件:HTTP 请求构造与解析辅助。
//!
//! 不直接发起网络调用 —— 仍由 `HostApi::http_request` 处理。
//! 这里提供:URL 拼接、form-urlencoded 编码、状态码检查、常用 UA。

use std::collections::HashMap;

use yeader_sdk::{HttpMethod, HttpRequest, HttpResponse, PluginError, PluginResult};

pub const DEFAULT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/// Percent-encode a single component (RFC 3986 unreserved set).
pub fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// Build a `key=value&key=value` query string with percent-encoding.
pub fn build_query(params: &[(&str, String)]) -> String {
    params
        .iter()
        .map(|(key, value)| format!("{}={}", percent_encode(key), percent_encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Append a query string to a URL, choosing `?` or `&` based on existing content.
pub fn append_query(url: &str, query: &str) -> String {
    if query.is_empty() {
        return url.to_string();
    }
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{url}{sep}{query}")
}

/// Status check: returns an `Api` error for non-2xx responses.
pub fn require_ok(response: &HttpResponse) -> PluginResult<()> {
    if (200..300).contains(&response.status) {
        Ok(())
    } else {
        Err(PluginError::Network(format!(
            "unexpected status: {}",
            response.status
        )))
    }
}

/// Body as UTF-8 string. Fails if non-UTF-8.
pub fn body_text(response: &HttpResponse) -> PluginResult<String> {
    String::from_utf8(response.body.clone())
        .map_err(|err| PluginError::Parse(format!("response is not utf-8: {err}")))
}

/// Fluent request builder. Useful when assembling many headers/queries.
#[derive(Debug, Clone)]
pub struct RequestBuilder {
    base_url: String,
    path: String,
    method: HttpMethod,
    query: Vec<(String, String)>,
    headers: HashMap<String, String>,
    form: Vec<(String, String)>,
    body: Option<Vec<u8>>,
}

impl RequestBuilder {
    pub fn new(base_url: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            path: path.into(),
            method: HttpMethod::Get,
            query: Vec::new(),
            headers: HashMap::new(),
            form: Vec::new(),
            body: None,
        }
    }

    pub fn method(mut self, method: HttpMethod) -> Self {
        self.method = method;
        self
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    pub fn headers<I, K, V>(mut self, iter: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        for (k, v) in iter {
            self.headers.insert(k.into(), v.into());
        }
        self
    }

    pub fn query(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.query.push((key.into(), value.into()));
        self
    }

    pub fn form(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.form.push((key.into(), value.into()));
        self
    }

    pub fn body(mut self, bytes: Vec<u8>) -> Self {
        self.body = Some(bytes);
        self
    }

    pub fn build(mut self) -> HttpRequest {
        let query_pairs: Vec<(&str, String)> = self
            .query
            .iter()
            .map(|(k, v)| (k.as_str(), v.clone()))
            .collect();
        let query_string = build_query(&query_pairs);
        let url = append_query(
            &format!(
                "{}{}",
                self.base_url.trim_end_matches('/'),
                if self.path.starts_with('/') {
                    self.path.clone()
                } else {
                    format!("/{}", self.path)
                }
            ),
            &query_string,
        );

        if !self.form.is_empty() && self.body.is_none() {
            let form_pairs: Vec<(&str, String)> = self
                .form
                .iter()
                .map(|(k, v)| (k.as_str(), v.clone()))
                .collect();
            self.body = Some(build_query(&form_pairs).into_bytes());
            self.headers
                .entry("content-type".to_string())
                .or_insert_with(|| "application/x-www-form-urlencoded".to_string());
        }

        self.headers
            .entry("user-agent".to_string())
            .or_insert_with(|| DEFAULT_USER_AGENT.to_string());

        HttpRequest {
            url,
            method: self.method,
            headers: self.headers,
            body: self.body,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encode_handles_reserved_chars() {
        assert_eq!(percent_encode("hello world"), "hello%20world");
        assert_eq!(percent_encode("a&b=c"), "a%26b%3Dc");
        assert_eq!(percent_encode("漫"), "%E6%BC%AB");
    }

    #[test]
    fn build_query_joins_pairs() {
        let q = build_query(&[("a", "1".to_string()), ("b", "two words".to_string())]);
        assert_eq!(q, "a=1&b=two%20words");
    }

    #[test]
    fn append_query_uses_correct_separator() {
        assert_eq!(append_query("https://x/y", "a=1"), "https://x/y?a=1");
        assert_eq!(append_query("https://x/y?z=0", "a=1"), "https://x/y?z=0&a=1");
        assert_eq!(append_query("https://x/y", ""), "https://x/y");
    }

    #[test]
    fn request_builder_assembles_form_post() {
        let req = RequestBuilder::new("https://api.example.com", "/login")
            .method(HttpMethod::Post)
            .form("user", "alice")
            .form("pass", "p@ss")
            .header("x-token", "abc")
            .build();

        assert_eq!(req.url, "https://api.example.com/login");
        assert_eq!(req.method, HttpMethod::Post);
        assert_eq!(req.body.as_deref(), Some(b"user=alice&pass=p%40ss".as_ref()));
        assert_eq!(
            req.headers.get("content-type").map(String::as_str),
            Some("application/x-www-form-urlencoded")
        );
        assert_eq!(req.headers.get("x-token").map(String::as_str), Some("abc"));
        assert!(req.headers.contains_key("user-agent"));
    }

    #[test]
    fn request_builder_handles_query_only_get() {
        let req = RequestBuilder::new("https://api.example.com/", "search")
            .query("q", "foo")
            .query("page", "2")
            .build();
        assert_eq!(req.url, "https://api.example.com/search?q=foo&page=2");
        assert_eq!(req.method, HttpMethod::Get);
        assert!(req.body.is_none());
    }
}
