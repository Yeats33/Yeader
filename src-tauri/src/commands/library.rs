use tauri::State;
use yeader_models::{Book, BookGroup, Bookmark, BookInfo, Chapter, LegacyBookSource, LegacyRssSource, LegacyReplaceRule, ReadingProgress, SearchResult};

use crate::state::AppState;

#[tauri::command]
pub fn list_book_sources(state: State<'_, AppState>) -> Result<Vec<LegacyBookSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
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
pub fn list_books(state: State<'_, AppState>) -> Result<Vec<Book>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
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
