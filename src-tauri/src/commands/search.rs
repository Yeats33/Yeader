use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use yeader_models::{LegacyBookSource, SearchResult};

use crate::state::AppState;

const LEGACY_BOOK_SOURCE_COMPAT_DISABLED: &str = "旧书源兼容已暂时关闭，等待 Yeader 自有书源格式。";
const TEST_RESULT_BATCH_SIZE: usize = 10;
const TEST_COOLDOWN_SECS: u64 = 300; // 5 minutes
const MAX_CONCURRENT_TESTS: usize = 20;

#[tauri::command]
pub async fn search_books(
    _state: State<'_, AppState>,
    _source_url: String,
    _keyword: String,
    _page: i32,
) -> Result<Vec<SearchResult>, String> {
    Err(LEGACY_BOOK_SOURCE_COMPAT_DISABLED.into())
}

#[allow(dead_code)]
async fn search_books_legacy(
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
    _state: State<'_, AppState>,
    _source_urls: Option<Vec<String>>,
) -> Result<Vec<BookSourceAvailability>, String> {
    Ok(Vec::new())
}

#[allow(dead_code)]
pub async fn test_book_sources_availability_legacy(
    state: State<'_, AppState>,
    source_urls: Option<Vec<String>>,
) -> Result<Vec<BookSourceAvailability>, String> {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Load sources and check cooldown
    let (sources, skipped): (Vec<_>, Vec<(String, String)>) = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        let all_sources: Vec<_> = match source_urls {
            Some(urls) => urls
                .iter()
                .filter_map(|url| {
                    repo.find_by_url(url)
                        .map_err(|e| e.to_string())
                        .ok()
                        .flatten()
                })
                .collect(),
            None => repo.list_all().map_err(|e| e.to_string())?,
        };

        let mut sources = Vec::new();
        let mut skipped = Vec::new();
        for source in all_sources {
            if let Some(ref last_tested) = source.last_tested_at {
                if let Ok(last_secs) = last_tested.parse::<u64>() {
                    if now_secs.saturating_sub(last_secs) < TEST_COOLDOWN_SECS {
                        skipped.push((source.book_source_url.clone(), last_tested.clone()));
                        continue;
                    }
                }
            }
            sources.push(source);
        }
        (sources, skipped)
    };

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_TESTS as _));
    let pending_persist = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<(
        String,
        bool,
        Option<String>,
        String,
    )>::new()));
    let sources_len = sources.len();
    let mut handles = Vec::with_capacity(sources_len);

    for source in sources {
        let sem = semaphore.clone();
        let pending = pending_persist.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.ok();

            let (available, detail) = match search_impl(&source, "测试", 1).await {
                Ok(_) => (true, Some("请求和解析通过".to_string())),
                Err(error) => (false, Some(error)),
            };

            let tested_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "0".to_string());

            let result = BookSourceAvailability {
                source_url: source.book_source_url.clone(),
                available,
                detail,
                tested_at: tested_at.clone(),
            };

            pending.lock().await.push((
                source.book_source_url.clone(),
                available,
                result.detail.clone(),
                tested_at,
            ));

            result
        });
        handles.push(handle);
    }

    let mut results: Vec<_> = Vec::with_capacity(sources_len);
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }

    // Persist results in batches
    let to_persist = std::sync::Arc::try_unwrap(pending_persist)
        .expect("all handles dropped")
        .into_inner();

    for chunk in to_persist.chunks(TEST_RESULT_BATCH_SIZE) {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        let _ = repo.set_test_result_batch(&chunk.to_vec());
    }

    // Add skipped sources as "冷却中"
    for (url, tested_at) in skipped {
        results.push(BookSourceAvailability {
            source_url: url,
            available: false,
            detail: Some("冷却中".to_string()),
            tested_at,
        });
    }

    Ok(results)
}
