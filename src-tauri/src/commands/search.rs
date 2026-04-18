use tauri::State;
use yeader_models::SearchResult;

use crate::state::AppState;

#[tauri::command]
pub fn search_books(
    _state: State<'_, AppState>,
    _source_url: String,
    _keyword: String,
    _page: i32,
) -> Result<Vec<SearchResult>, String> {
    // TODO: integrate yeader-reader search pipeline
    Ok(Vec::new())
}
