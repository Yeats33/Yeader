use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use yeader_models::{LegacyBookSource, SearchResult};

use crate::state::AppState;

#[tauri::command]
pub async fn search_books(
    state: State<'_, AppState>,
    source_url: String,
    keyword: String,
    page: i32,
) -> Result<Vec<SearchResult>, String> {
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Book source not found".to_string())?
    };

    search_impl(&source, &keyword, page).await
}

async fn search_impl(
    source: &LegacyBookSource,
    keyword: &str,
    page: i32,
) -> Result<Vec<SearchResult>, String> {
    let client = yeader_net::HttpClient::new();
    let results = yeader_rules::search_books(&client, source, keyword, page)
        .await
        .map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| SearchResult {
            source_id: source.book_source_url.clone(),
            name: r.name,
            author: r.author,
            book_url: r.book_url,
            cover_url: r.cover_url,
            intro: r.intro,
            kind: r.kind,
            last_chapter: r.last_chapter,
            word_count: r.word_count,
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSourceAvailability {
    pub source_url: String,
    pub available: bool,
    pub detail: Option<String>,
    pub tested_at: String,
}

#[tauri::command]
pub async fn test_book_sources_availability(
    state: State<'_, AppState>,
    source_urls: Option<Vec<String>>,
) -> Result<Vec<BookSourceAvailability>, String> {
    let sources = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        match source_urls {
            Some(urls) => {
                let mut collected = Vec::with_capacity(urls.len());
                for url in urls {
                    if let Some(source) = repo.find_by_url(&url).map_err(|e| e.to_string())? {
                        collected.push(source);
                    } else {
                        collected.push(LegacyBookSource {
                            book_source_url: url,
                            book_source_name: String::new(),
                            book_source_group: None,
                            search_url: None,
                            book_url_pattern: None,
                            login_check_js: None,
                            book_source_type: None,
                            enabled_explore: None,
                            explore_url: None,
                            rule_search: None,
                            rule_book_info: None,
                            rule_toc: None,
                            rule_content: None,
                            enabled: false,
                            last_test_available: None,
                            last_tested_at: None,
                            last_test_detail: None,
                            extra: Default::default(),
                        });
                    }
                }
                collected
            }
            None => repo.list_all().map_err(|e| e.to_string())?,
        }
    };

    let mut results = Vec::with_capacity(sources.len());
    let tested_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    for source in sources {
        let result = match search_impl(&source, "测试", 1).await {
            Ok(_) => BookSourceAvailability {
                source_url: source.book_source_url.clone(),
                available: true,
                detail: Some("请求和解析通过".to_string()),
                tested_at: tested_at.clone(),
            },
            Err(error) => BookSourceAvailability {
                source_url: source.book_source_url.clone(),
                available: false,
                detail: Some(error),
                tested_at: tested_at.clone(),
            },
        };
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        let _ = repo.set_test_result(
            &result.source_url,
            result.available,
            result.detail.clone(),
            &result.tested_at,
        );
        results.push(result);
    }

    Ok(results)
}
