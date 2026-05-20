use crate::state::AppState;
use serde_json::Map;
use tauri::State;
use uuid::Uuid;
use yeader_models::{FeedItem, FeedSource, LegacyRssSource};

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

            let published = entry.published.or(entry.updated).map(|d| d.to_rfc3339());

            let updated = entry.updated.map(|d| d.to_rfc3339());

            let author = entry.authors.into_iter().next().map(|a| a.name);

            let summary = entry
                .summary
                .map(|s| s.content)
                .filter(|s| !s.trim().is_empty());

            let content_html = entry.content.and_then(|c| c.body).filter(|b| !b.is_empty());

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

/// Save an RSS source (from probe result) to the database.
#[tauri::command]
pub fn save_rss_source(
    state: State<'_, AppState>,
    source: FeedSource,
) -> Result<FeedSource, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::RssSourceRepo::new(&db);

    let mut extra = Map::new();
    extra.insert("itemCount".into(), serde_json::Value::Number(0.into()));
    extra.insert("lastFetched".into(), serde_json::Value::Null);

    let legacy = LegacyRssSource {
        source_url: source.url.clone(),
        source_name: source.title.clone(),
        source_icon: source
            .icon_url
            .as_ref()
            .map(|s| s.as_str())
            .unwrap_or("")
            .to_string(),
        rule_articles: None,
        enabled: source.enabled,
        extra,
    };

    repo.upsert(&legacy).map_err(|e| e.to_string())?;
    Ok(source)
}

/// List all RSS sources from the database.
#[tauri::command]
pub fn list_rss_sources(state: State<'_, AppState>) -> Result<Vec<LegacyRssSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::RssSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

/// Delete an RSS source by URL.
#[tauri::command]
pub fn delete_rss_source(state: State<'_, AppState>, url: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::RssSourceRepo::new(&db);
    repo.delete(&url).map_err(|e| e.to_string())
}

/// Update RSS source metadata (item count, last fetched).
#[tauri::command]
pub fn update_rss_source_metadata(
    state: State<'_, AppState>,
    url: String,
    item_count: i32,
    last_fetched: String,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let mut source = yeader_library::RssSourceRepo::new(&db)
        .find_by_url(&url)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "RSS source not found".to_string())?;

    source.extra.insert(
        "itemCount".into(),
        serde_json::Value::Number(item_count.into()),
    );
    source.extra.insert(
        "lastFetched".into(),
        serde_json::Value::String(last_fetched),
    );

    let repo = yeader_library::RssSourceRepo::new(&db);
    repo.upsert(&source).map_err(|e| e.to_string())?;
    Ok(true)
}
