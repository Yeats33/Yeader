use tauri::State;

use crate::state::SharedState;

#[tauri::command]
pub async fn search_books(
    source_url: String,
    keyword: String,
    page: i32,
    state: State<'_, SharedState>,
) -> Result<Vec<yeader_rules::BookSearchResult>, String> {
    // STUB: will be implemented with real pipeline
    Err("Not yet implemented".into())
}
