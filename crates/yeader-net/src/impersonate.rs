//! Browser-impersonating HTTP client backed by `wreq` + `wreq-util`.
//!
//! Used for sources that opt in via `requestDefaults.impersonate` to defeat
//! Cloudflare-style TLS/HTTP2 fingerprint gates. The default request path
//! still goes through the plain `reqwest`-based [`HttpClient`].

use std::sync::OnceLock;
use std::time::Duration;

use wreq::{
    Client, Method,
    header::{HeaderMap, HeaderName, HeaderValue},
};
use wreq_util::Emulation;

use crate::client::{HttpError, HttpResponse};
use crate::encoding::{decode_bytes, extract_charset_from_content_type};

/// Resolve a user-supplied profile string to a `wreq_util::Emulation`.
/// Returns the latest Chrome by default for unknown / generic values so a bare
/// `"chrome"` keeps working without a version pin.
fn resolve_emulation(profile: &str) -> Emulation {
    let normalized = profile.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "chrome" | "chrome-latest" | "" => Emulation::Chrome137,
        "chrome100" => Emulation::Chrome100,
        "chrome120" => Emulation::Chrome120,
        "chrome124" => Emulation::Chrome124,
        "chrome131" => Emulation::Chrome131,
        "chrome132" => Emulation::Chrome132,
        "chrome133" => Emulation::Chrome133,
        "chrome134" => Emulation::Chrome134,
        "chrome135" => Emulation::Chrome135,
        "chrome136" => Emulation::Chrome136,
        "chrome137" => Emulation::Chrome137,
        "safari" | "safari-latest" => Emulation::Safari18_5,
        "safari18" => Emulation::Safari18,
        "safari18_2" => Emulation::Safari18_2,
        "safari18_3" => Emulation::Safari18_3,
        "safari18_5" => Emulation::Safari18_5,
        "firefox" | "firefox-latest" => Emulation::Firefox139,
        "firefox128" => Emulation::Firefox128,
        "firefox133" => Emulation::Firefox133,
        "firefox139" => Emulation::Firefox139,
        "edge" | "edge-latest" => Emulation::Edge134,
        "edge131" => Emulation::Edge131,
        "edge134" => Emulation::Edge134,
        _ => Emulation::Chrome137,
    }
}

pub struct ImpersonateClient {
    inner: Client,
}

impl ImpersonateClient {
    pub fn new(profile: &str) -> Result<Self, HttpError> {
        let emulation = resolve_emulation(profile);
        let inner = Client::builder()
            .emulation(emulation)
            .cookie_store(true)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| HttpError::Decoding(format!("wreq build failed: {e}")))?;
        Ok(Self { inner })
    }

    pub async fn get(&self, url: &str, headers: &HeaderMap) -> Result<HttpResponse, HttpError> {
        self.request(Method::GET, url, None, headers).await
    }

    pub async fn post_form(
        &self,
        url: &str,
        body: &str,
        headers: &HeaderMap,
    ) -> Result<HttpResponse, HttpError> {
        self.request(
            Method::POST,
            url,
            Some((body.to_string(), "application/x-www-form-urlencoded")),
            headers,
        )
        .await
    }

    async fn request(
        &self,
        method: Method,
        url: &str,
        body: Option<(String, &str)>,
        headers: &HeaderMap,
    ) -> Result<HttpResponse, HttpError> {
        let mut builder = self.inner.request(method, url);

        for (name, value) in headers.iter() {
            builder = builder.header(name.clone(), value.clone());
        }

        if let Some((body, content_type)) = body {
            builder = builder.header("Content-Type", content_type).body(body);
        }

        let resp = builder
            .send()
            .await
            .map_err(|e| HttpError::Decoding(format!("wreq request failed: {e}")))?;
        let status = resp.status().as_u16();
        let final_url = resp.uri().to_string();

        let content_type = resp
            .headers()
            .get("Content-Type")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| HttpError::Decoding(format!("wreq body read failed: {e}")))?;

        let body = if let Some(ct) = content_type.as_deref() {
            let charset = extract_charset_from_content_type(ct);
            decode_bytes(&bytes, charset.as_deref())
                .map_err(|e| HttpError::Decoding(e.to_string()))?
        } else {
            decode_bytes(&bytes, None).map_err(|e| HttpError::Decoding(e.to_string()))?
        };

        if !(200..300).contains(&status) && status != 304 {
            return Err(HttpError::Status {
                status,
                message: body.chars().take(200).collect(),
            });
        }

        Ok(HttpResponse {
            url: final_url,
            body,
            status,
        })
    }
}

/// Convert a `reqwest::header::HeaderMap` into a `wreq::header::HeaderMap` by
/// copying name + value bytes. Both crates layer on `http::HeaderMap` but the
/// re-exports are distinct types so we go through the wire format to stay
/// version-agnostic.
pub fn convert_headers(src: &reqwest::header::HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::with_capacity(src.len());
    for (name, value) in src.iter() {
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out.insert(n, v);
        }
    }
    out
}

/// Process-wide cache of impersonate clients keyed by profile string so we
/// don't re-pay TLS config + HTTP2 settings on every request.
pub fn shared_client(profile: &str) -> Result<&'static ImpersonateClient, HttpError> {
    use std::collections::HashMap;
    use std::sync::Mutex;

    static CACHE: OnceLock<Mutex<HashMap<String, &'static ImpersonateClient>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    let key = profile.trim().to_ascii_lowercase();
    {
        let guard = cache.lock().expect("impersonate cache mutex poisoned");
        if let Some(client) = guard.get(&key) {
            return Ok(*client);
        }
    }

    let client = ImpersonateClient::new(&key)?;
    let leaked: &'static ImpersonateClient = Box::leak(Box::new(client));
    let mut guard = cache.lock().expect("impersonate cache mutex poisoned");
    Ok(*guard.entry(key).or_insert(leaked))
}
