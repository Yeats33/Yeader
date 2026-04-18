use yeader_net::HttpClient;

#[test]
fn test_http_client_builds() {
    let _client = HttpClient::new();
}

#[test]
fn test_http_client_default() {
    let _client = HttpClient::default();
}
