//! Smoke test: probe a Cloudflare-protected target through the impersonate
//! client to verify TLS fingerprint bypass.
//!
//! Run with:
//!   cargo run -p yeader-net --example test_impersonate -- https://czbooks.net/

use std::env;

use yeader_net::ImpersonateClient;

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = env::args()
        .nth(1)
        .unwrap_or_else(|| "https://czbooks.net/".to_string());
    let profile = env::args()
        .nth(2)
        .unwrap_or_else(|| "chrome137".to_string());

    println!("→ GET {url} (impersonate={profile})");
    let client = ImpersonateClient::new(&profile)?;
    let headers = wreq::header::HeaderMap::new();
    match client.get(&url, &headers).await {
        Ok(resp) => {
            println!("✓ status={} final_url={}", resp.status, resp.url);
            println!("  body_len={}", resp.body.len());
            println!(
                "  preview={}",
                resp.body.chars().take(160).collect::<String>()
            );
        }
        Err(e) => {
            println!("✗ {e}");
            std::process::exit(1);
        }
    }
    Ok(())
}
