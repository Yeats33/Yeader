use crate::state::AppState;
use tauri::State;
use yeader_models::{
    Book, LegacyBookSource, LegacyReplaceRule, LegacyRssSource, ReadingProgress, YeaderSource,
    parse_yeader_source_pack,
};

const LEGACY_BOOK_SOURCE_COMPAT_DISABLED: &str = "旧书源兼容已暂时关闭，等待 Yeader 自有书源格式。";

#[tauri::command]
pub fn list_book_sources(_state: State<'_, AppState>) -> Result<Vec<LegacyBookSource>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_yeader_sources(state: State<'_, AppState>) -> Result<Vec<YeaderSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_yeader_source_pack_json(
    state: State<'_, AppState>,
    json: String,
) -> Result<Vec<YeaderSource>, String> {
    let pack =
        parse_yeader_source_pack(&json).map_err(|e| format!("Failed to parse source pack: {}", e))?;
    if pack.format != "yeader.source-pack" {
        return Err(format!("Unsupported source pack format: {}", pack.format));
    }

    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.upsert_batch(&pack.sources).map_err(|e| e.to_string())?;
    Ok(pack.sources)
}

#[tauri::command]
pub fn load_book_sources_from_file(
    _state: State<'_, AppState>,
) -> Result<Vec<LegacyBookSource>, String> {
    Err(LEGACY_BOOK_SOURCE_COMPAT_DISABLED.into())
}

#[tauri::command]
pub fn import_book_sources_json(
    _state: State<'_, AppState>,
    _json: String,
) -> Result<Vec<LegacyBookSource>, String> {
    Err(LEGACY_BOOK_SOURCE_COMPAT_DISABLED.into())
}

#[tauri::command]
pub async fn import_book_sources_url(
    _state: State<'_, AppState>,
    _url: String,
) -> Result<Vec<LegacyBookSource>, String> {
    Err(LEGACY_BOOK_SOURCE_COMPAT_DISABLED.into())
}

#[tauri::command]
pub async fn import_book_sources_subscription(
    _state: State<'_, AppState>,
    _url: String,
) -> Result<Vec<LegacyBookSource>, String> {
    Err(LEGACY_BOOK_SOURCE_COMPAT_DISABLED.into())
}

#[tauri::command]
pub fn list_replace_rules(_state: State<'_, AppState>) -> Result<Vec<LegacyReplaceRule>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_rss_sources(_state: State<'_, AppState>) -> Result<Vec<LegacyRssSource>, String> {
    Ok(Vec::new())
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
