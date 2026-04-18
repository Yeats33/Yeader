use tauri::State;

use crate::state::SharedState;

#[tauri::command]
pub async fn fetch_book_info(
    book_url: String,
    source_url: String,
    state: State<'_, SharedState>,
) -> Result<yeader_reader::BookInfo, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub async fn fetch_toc(
    toc_url: String,
    source_url: String,
    state: State<'_, SharedState>,
) -> Result<Vec<yeader_reader::Chapter>, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub async fn fetch_content(
    chapter_url: String,
    source_url: String,
    state: State<'_, SharedState>,
) -> Result<String, String> {
    Err("Not yet implemented".into())
}

#[tauri::command]
pub fn get_reading_progress(
    book_id: String,
    state: State<'_, SharedState>,
) -> Result<Option<yeader_models::ReadingProgress>, String> {
    let repo = yeader_library::ReadingProgressRepo::new(&state.db.lock().unwrap());
    repo.find_by_book(&book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_reading_progress(
    progress: yeader_models::ReadingProgress,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let repo = yeader_library::ReadingProgressRepo::new(&state.db.lock().unwrap());
    repo.upsert(&progress).map_err(|e| e.to_string())
}
