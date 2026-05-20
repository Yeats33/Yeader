use uuid::Uuid;
use yeader_models::{FeedItem, FeedSource};

/// Parse and normalize a feed (RSS 2.0 or Atom) into FeedItems.
#[tauri::command]
pub async fn fetch_feed(url: String) -> Result<Vec<FeedItem>, String> {
    let client = yeader_net::HttpClient::new();
    let response = client
        .get(&url, &reqwest::header::HeaderMap::new())
        .await
        .map_err(|e| format!("Failed to fetch feed: {}", e))?;

    let feed = feed_rs::parser::parse(response.body.as_bytes())
        .map_err(|e| format!("Failed to parse feed: {}", e))?;

    let source_id = url.trim().to_string();
    let items: Vec<FeedItem> = feed
        .entries
        .into_iter()
        .map(|entry| {
            let id = entry.id.clone();
            let links_url = entry
                .links
                .first()
                .map(|l| l.href.clone())
                .unwrap_or_default();

            let published = entry
                .published
                .or(entry.updated)
                .map(|d| d.to_rfc3339());

            let updated = entry.updated.map(|d| d.to_rfc3339());

            let author = entry.authors.into_iter().next().map(|a| a.name);

            let summary = entry
                .summary
                .map(|s| s.content)
                .filter(|s| !s.trim().is_empty());

            let content_html = entry
                .content
                .and_then(|c| c.body)
                .filter(|b| !b.is_empty());

            let image_url = entry
                .media
                .iter()
                .flat_map(|m| &m.content)
                .find_map(|mc| mc.url.as_ref().map(|u| u.to_string()))
                .or_else(|| {
                    entry
                        .media
                        .iter()
                        .flat_map(|m| &m.thumbnails)
                        .find_map(|t| Some(t.image.uri.clone()))
                });

            FeedItem {
                id,
                source_id: source_id.clone(),
                title: entry
                    .title
                    .map(|t| t.content)
                    .unwrap_or_else(|| "(no title)".to_string()),
                url: links_url,
                author,
                published,
                updated,
                summary,
                content_html,
                image_url,
                read: false,
            }
        })
        .collect();

    Ok(items)
}

/// Probe a URL to find feed metadata (title, description, link).
#[tauri::command]
pub async fn probe_feed(url: String) -> Result<FeedSource, String> {
    let client = yeader_net::HttpClient::new();
    let response = client
        .get(&url, &reqwest::header::HeaderMap::new())
        .await
        .map_err(|e| format!("Failed to fetch feed: {}", e))?;

    let feed = feed_rs::parser::parse(response.body.as_bytes())
        .map_err(|e| format!("Failed to parse feed: {}", e))?;

    let id = Uuid::new_v4().to_string();

    let image_url = feed
        .logo
        .map(|l| l.uri)
        .or_else(|| feed.icon.map(|i| i.uri));

    Ok(FeedSource {
        id,
        url: url.trim().to_string(),
        title: feed
            .title
            .map(|t| t.content)
            .unwrap_or_else(|| "Untitled Feed".to_string()),
        description: feed.description.map(|d| d.content),
        link: feed.links.first().map(|l| l.href.clone()),
        icon_url: image_url,
        media_type: "rss".to_string(),
        folder: None,
        enabled: true,
    })
}
