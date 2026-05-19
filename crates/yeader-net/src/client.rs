//! HTTP client wrapper using reqwest.

use reqwest::{Client, Method, Response, header::HeaderMap};
use thiserror::Error;

use crate::encoding::{decode_bytes, extract_charset_from_content_type};

#[derive(Error, Debug)]
pub enum HttpError {
    #[error("Request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("HTTP error {status}: {message}")]
    Status { status: u16, message: String },
    #[error("Decoding error: {0}")]
    Decoding(String),
}

pub type Result<T> = std::result::Result<T, HttpError>;

pub struct HttpClient {
    inner: Client,
}

impl HttpClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .cookie_store(true)
            .gzip(true)
            .build()
            .expect("reqwest Client should build successfully");
        Self { inner: client }
    }

    pub async fn get(&self, url: &str, headers: &HeaderMap) -> Result<HttpResponse> {
        self.request(Method::GET, url, None, headers).await
    }

    pub async fn post_form(
        &self,
        url: &str,
        body: &str,
        headers: &HeaderMap,
    ) -> Result<HttpResponse> {
        self.request(
            Method::POST,
            url,
            Some((body.into(), "application/x-www-form-urlencoded")),
            headers,
        )
        .await
    }

    pub async fn post_json(
        &self,
        url: &str,
        body: &str,
        headers: &HeaderMap,
    ) -> Result<HttpResponse> {
        self.request(
            Method::POST,
            url,
            Some((body.into(), "application/json")),
            headers,
        )
        .await
    }

    pub async fn head(&self, url: &str, headers: &HeaderMap) -> Result<HttpResponse> {
        self.request(Method::HEAD, url, None, headers).await
    }

    async fn request(
        &self,
        method: Method,
        url: &str,
        body: Option<(String, &str)>,
        headers: &HeaderMap,
    ) -> Result<HttpResponse> {
        let mut builder = self.inner.request(method, url);

        for (name, value) in headers.iter() {
            builder = builder.header(name, value);
        }

        if let Some((body, content_type)) = body {
            builder = builder.header("Content-Type", content_type).body(body);
        }

        let resp = builder.send().await?;
        let status = resp.status().as_u16();
        let final_url = resp.url().to_string();

        let HttpResponse {
            body,
            url: _,
            status: _,
        } = decode_response(resp).await?;

        if !(status >= 200 && status < 300) && status != 304 {
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

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}

pub struct HttpResponse {
    pub url: String,
    pub body: String,
    pub status: u16,
}

async fn decode_response(resp: Response) -> Result<HttpResponse> {
    let url = resp.url().to_string();
    let status = resp.status().as_u16();

    let content_type = resp
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = resp.bytes().await.map_err(HttpError::Request)?;

    let body = if let Some(ct) = content_type {
        let charset = extract_charset_from_content_type(&ct);
        decode_bytes(&bytes, charset.as_deref()).map_err(|e| HttpError::Decoding(e.to_string()))?
    } else {
        // Default to UTF-8, fallback to chardet
        decode_bytes(&bytes, None).map_err(|e| HttpError::Decoding(e.to_string()))?
    };

    Ok(HttpResponse { url, body, status })
}
