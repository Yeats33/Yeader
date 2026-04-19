use tauri::State;
use tracing::{info, warn};
use yeader_models::{BookInfo as ModelBookInfo, Chapter as ModelChapter, LegacyBookSource};

use crate::state::AppState;

#[tauri::command]
pub async fn fetch_book_info(
    state: State<'_, AppState>,
    book_url: String,
    source_url: String,
) -> Result<ModelBookInfo, String> {
    info!("fetch_book_info called: book_url={}, source_url={}", book_url, source_url);

    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                warn!("fetch_book_info: source not found: {}", source_url);
                format!("Book source not found: {}", source_url)
            })?
    };

    let resolved_url = yeader_net::resolve_book_url(&source, &book_url);
    info!("fetch_book_info: resolved_url={}", resolved_url);

    let client = yeader_net::HttpClient::new();
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!("fetch_book_info HTTP failed: resolved={}, error={}", resolved_url, e);
            format!("HTTP error: {}", e)
        })?;

    info!("fetch_book_info: got body len={}", response.body.len());
    let preview: String = response.body.chars().take(200).collect();
    info!("fetch_book_info: body preview: {}", preview);
    let info = yeader_reader::fetch_book_info(&source, &book_url, &response.body);
    info!("fetch_book_info: parsed info: title={}, toc_url={}", info.title, info.toc_url);

    Ok(ModelBookInfo {
        name: info.title,
        author: info.author,
        intro: Some(info.intro),
        kind: Some(info.kind),
        cover_url: Some(info.cover_url),
        toc_url: Some(info.toc_url),
        last_chapter: Some(info.last_chapter),
        word_count: Some(info.word_count),
    })
}

#[tauri::command]
pub async fn fetch_toc(
    state: State<'_, AppState>,
    toc_url: String,
    source_url: String,
) -> Result<Vec<ModelChapter>, String> {
    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Book source not found: {}", source_url))?
    };

    let client = yeader_net::HttpClient::new();
    let resolved_url = yeader_net::resolve_book_url(&source, &toc_url);
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!("fetch_toc HTTP failed: resolved={}, error={}", resolved_url, e);
            format!("HTTP error: {}", e)
        })?;

    let chapters = yeader_reader::fetch_toc(&source, &toc_url, &toc_url, &response.body);

    Ok(chapters
        .into_iter()
        .map(|ch| ModelChapter {
            title: ch.title,
            url: ch.url,
            is_volume: ch.is_volume,
            is_vip: ch.is_vip,
            is_pay: ch.is_pay,
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_content(
    state: State<'_, AppState>,
    chapter_url: String,
    source_url: String,
) -> Result<String, String> {
    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Book source not found: {}", source_url))?
    };

    let client = yeader_net::HttpClient::new();
    let resolved_url = yeader_net::resolve_book_url(&source, &chapter_url);
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!(
                "fetch_content HTTP failed: resolved={}, error={}",
                resolved_url, e
            );
            format!("HTTP error: {}", e)
        })?;

    let content =
        yeader_reader::fetch_content(&source, &chapter_url, &response.body, &[]);

    Ok(content)
}
