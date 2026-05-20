use std::collections::HashMap;

use async_trait::async_trait;
use reqwest::Client;
use yeader_sdk::{
    HostApi, HttpMethod, HttpRequest, HttpResponse, LogLevel, PluginError, PluginResult,
};

/// Shared HTTP host API. Owns a single reqwest client with cookie jar so
/// plugins on the same host instance share session state.
#[derive(Debug, Clone)]
pub struct HttpHostApi {
    client: Client,
}

impl HttpHostApi {
    pub fn new() -> Self {
        Self::with_client(
            Client::builder()
                .cookie_store(true)
                .gzip(true)
                .build()
                .expect("failed to build reqwest client"),
        )
    }

    pub fn with_client(client: Client) -> Self {
        Self { client }
    }
}

impl Default for HttpHostApi {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HostApi for HttpHostApi {
    async fn http_request(&self, request: HttpRequest) -> PluginResult<HttpResponse> {
        let method = match request.method {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
            HttpMethod::Put => reqwest::Method::PUT,
            HttpMethod::Delete => reqwest::Method::DELETE,
        };

        let mut builder = self.client.request(method, &request.url);
        for (key, value) in &request.headers {
            builder = builder.header(key, value);
        }
        if let Some(body) = request.body {
            builder = builder.body(body);
        }

        let response = builder
            .send()
            .await
            .map_err(|err| PluginError::Network(err.to_string()))?;
        let status = response.status().as_u16();
        let mut headers: HashMap<String, Vec<String>> = HashMap::new();
        for (name, value) in response.headers().iter() {
            headers
                .entry(name.as_str().to_ascii_lowercase())
                .or_default()
                .push(value.to_str().unwrap_or_default().to_string());
        }
        let body = response
            .bytes()
            .await
            .map_err(|err| PluginError::Network(err.to_string()))?
            .to_vec();

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }

    fn log(&self, level: LogLevel, message: &str) {
        match level {
            LogLevel::Debug => tracing::debug!("{message}"),
            LogLevel::Info => tracing::info!("{message}"),
            LogLevel::Warn => tracing::warn!("{message}"),
            LogLevel::Error => tracing::error!("{message}"),
        }
    }
}
