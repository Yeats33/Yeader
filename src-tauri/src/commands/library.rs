use crate::state::AppState;
use tauri::State;
use yeader_models::{Book, ReadingProgress, YeaderSource, parse_yeader_source_pack};

#[tauri::command]
pub fn list_yeader_sources(state: State<'_, AppState>) -> Result<Vec<YeaderSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_yeader_source(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.set_enabled(&id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_yeader_source(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_yeader_source_pack_json(
    state: State<'_, AppState>,
    json: String,
) -> Result<Vec<YeaderSource>, String> {
    let pack = parse_yeader_source_pack(&json)
        .map_err(|e| format!("Failed to parse source pack: {}", e))?;
    if pack.format != "yeader.source-pack" {
        return Err(format!("Unsupported source pack format: {}", pack.format));
    }

    let db = state.db.lock().unwrap();
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    repo.upsert_batch(&pack.sources)
        .map_err(|e| e.to_string())?;
    Ok(pack.sources)
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
