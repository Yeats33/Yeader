use crate::state::AppState;
use serde_json::Value;
use tauri::State;
use yeader_models::parse_book_sources;
use yeader_models::{Book, LegacyBookSource, LegacyReplaceRule, LegacyRssSource, ReadingProgress};

async fn fetch_book_sources_from_url(url: &str) -> Result<Vec<LegacyBookSource>, String> {
    let client = yeader_net::HttpClient::new();
    let resp = client
        .get(url, &Default::default())
        .await
        .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;
    parse_book_sources(&resp.body).map_err(|e| format!("Failed to parse book sources: {}", e))
}

#[tauri::command]
pub fn list_book_sources(state: State<'_, AppState>) -> Result<Vec<LegacyBookSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_book_sources_from_file(
    state: State<'_, AppState>,
) -> Result<Vec<LegacyBookSource>, String> {
    let json = include_str!("../../../fixtures/legado/sources/sample-book-source.json");
    let sources =
        parse_book_sources(json).map_err(|e| format!("Failed to parse book sources: {}", e))?;
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
    Ok(sources)
}

#[tauri::command]
pub fn import_book_sources_json(
    state: State<'_, AppState>,
    json: String,
) -> Result<Vec<LegacyBookSource>, String> {
    let sources =
        parse_book_sources(&json).map_err(|e| format!("Failed to parse book sources: {}", e))?;
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
    Ok(sources)
}

#[tauri::command]
pub async fn import_book_sources_url(
    state: State<'_, AppState>,
    url: String,
) -> Result<Vec<LegacyBookSource>, String> {
    let sources = fetch_book_sources_from_url(&url).await?;
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
    Ok(sources)
}

#[tauri::command]
pub async fn import_book_sources_subscription(
    state: State<'_, AppState>,
    url: String,
) -> Result<Vec<LegacyBookSource>, String> {
    let mut sources = fetch_book_sources_from_url(&url).await?;
    for source in &mut sources {
        source
            .extra
            .insert("subscriptionUrl".into(), Value::String(url.clone()));
    }
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
    Ok(sources)
}

#[tauri::command]
pub fn list_replace_rules(state: State<'_, AppState>) -> Result<Vec<LegacyReplaceRule>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::ReplaceRuleRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_rss_sources(state: State<'_, AppState>) -> Result<Vec<LegacyRssSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::RssSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_book_source(state: State<'_, AppState>, url: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.delete(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_book_source(
    state: State<'_, AppState>,
    url: String,
    enabled: bool,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.set_enabled(&url, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_books(state: State<'_, AppState>) -> Result<Vec<Book>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_book(state: State<'_, AppState>, url: String) -> Result<Option<Book>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    repo.find_by_url(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_book_to_shelf(state: State<'_, AppState>, book: Book) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    repo.upsert(&book).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_book(state: State<'_, AppState>, url: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    repo.delete(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_reading_progress(
    state: State<'_, AppState>,
    book_id: String,
) -> Result<Option<ReadingProgress>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::ReadingProgressRepo::new(&db);
    repo.find_by_book(&book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_reading_progress(
    state: State<'_, AppState>,
    progress: ReadingProgress,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::ReadingProgressRepo::new(&db);
    repo.upsert(&progress).map_err(|e| e.to_string())
}
