use yeader_net::HttpClient;

#[tokio::test]
async fn test_http_client_async_construction() {
    let _client = HttpClient::new();
}

#[test]
fn test_client_creation_does_not_panic() {
    let _client = HttpClient::default();
}
