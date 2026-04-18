use tauri::State;

use crate::state::SharedState;
use yeader_library::{Book, BookRepo};

#[tauri::command]
pub fn list_book_sources(state: State<'_, SharedState>) -> Result<Vec<yeader_models::LegacyBookSource>, String> {
    let repo = yeader_library::BookSourceRepo::new(&state.db.lock().unwrap());
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_replace_rules(state: State<'_, SharedState>) -> Result<Vec<yeader_models::LegacyReplaceRule>, String> {
    let repo = yeader_library::ReplaceRuleRepo::new(&state.db.lock().unwrap());
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_rss_sources(state: State<'_, SharedState>) -> Result<Vec<yeader_models::LegacyRssSource>, String> {
    let repo = yeader_library::RssSourceRepo::new(&state.db.lock().unwrap());
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_books(state: State<'_, SharedState>) -> Result<Vec<Book>, String> {
    let repo = BookRepo::new(&state.db.lock().unwrap());
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_book_to_shelf(book: Book, state: State<'_, SharedState>) -> Result<(), String> {
    let repo = BookRepo::new(&state.db.lock().unwrap());
    repo.upsert(&book).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_book(book_url: String, state: State<'_, SharedState>) -> Result<bool, String> {
    let repo = BookRepo::new(&state.db.lock().unwrap());
    repo.delete(&book_url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_book_source(url: String, state: State<'_, SharedState>) -> Result<bool, String> {
    let repo = yeader_library::BookSourceRepo::new(&state.db.lock().unwrap());
    repo.delete(&url).map_err(|e| e.to_string())
}
