use tauri::State;
use yeader_models::{BookInfo, Chapter};

use crate::state::AppState;

#[tauri::command]
pub fn fetch_book_info(
    _state: State<'_, AppState>,
    _book_url: String,
    _source_url: String,
) -> Result<BookInfo, String> {
    // TODO: integrate yeader-reader book info pipeline
    Err("fetch_book_info not yet implemented".into())
}

#[tauri::command]
pub fn fetch_toc(
    _state: State<'_, AppState>,
    _toc_url: String,
    _source_url: String,
) -> Result<Vec<Chapter>, String> {
    // TODO: integrate yeader-reader TOC pipeline
    Err("fetch_toc not yet implemented".into())
}

#[tauri::command]
pub fn fetch_content(
    _state: State<'_, AppState>,
    _chapter_url: String,
    _source_url: String,
) -> Result<String, String> {
    // TODO: integrate yeader-reader content pipeline
    Err("fetch_content not yet implemented".into())
}
