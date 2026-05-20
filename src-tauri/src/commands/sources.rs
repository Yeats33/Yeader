//! Unified source management commands.

use crate::state::AppState;
use tauri::State;
use yeader_library::{BookSourceRepo, SourceKind, SourceRegistry, UnifiedSource, YeaderSourceRepo};
use yeader_models::{YeaderSource, parse_book_sources};

/// Parse kind string into SourceKind, or return error.
fn parse_kind(kind: &str) -> Result<SourceKind, String> {
    SourceKind::parse(kind).ok_or_else(|| format!("unknown source kind: {}", kind))
}

/// List all sources, optionally filtered by kind.
/// kind: "booksource" | "rss" | "plugin" | null (all)
#[tauri::command]
pub fn list_sources(
    state: State<'_, AppState>,
    kind: Option<String>,
) -> Result<Vec<UnifiedSource>, String> {
    let db = state.db.lock().unwrap();
    let registry = SourceRegistry::new(&db);
    let kind_filter = kind.as_ref().and_then(|k| SourceKind::parse(k.as_str()));
    Ok(registry.list_sources(kind_filter))
}

/// Import a source from JSON (auto-detects format).
#[tauri::command]
pub fn import_source(state: State<'_, AppState>, json: String) -> Result<UnifiedSource, String> {
    let db = state.db.lock().unwrap();
    let registry = SourceRegistry::new(&db);
    registry.import_source(&json)
}

/// Delete a source by id and kind.
#[tauri::command]
pub fn delete_source(state: State<'_, AppState>, id: String, kind: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let registry = SourceRegistry::new(&db);
    let kind = parse_kind(&kind)?;
    registry.delete_source(&id, kind)
}

/// Toggle a source's enabled state.
#[tauri::command]
pub fn toggle_source(
    state: State<'_, AppState>,
    id: String,
    kind: String,
    enabled: bool,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let registry = SourceRegistry::new(&db);
    let kind = parse_kind(&kind)?;
    registry.toggle_source(&id, kind, enabled)
}

// ---------------------------------------------------------------------------
// Book Source Management (Legacy Legado format)
// ---------------------------------------------------------------------------

/// Import one or more Legado-format book sources from JSON.
#[tauri::command]
pub fn import_book_source(state: State<'_, AppState>, json: String) -> Result<usize, String> {
    let sources =
        parse_book_sources(&json).map_err(|e| format!("invalid book source JSON: {}", e))?;
    if sources.is_empty() {
        return Err("no book sources found in JSON".to_string());
    }
    let db = state.db.lock().unwrap();
    let repo = BookSourceRepo::new(&db);
    repo.upsert_batch(&sources).map_err(|e| e.to_string())?;
    Ok(sources.len())
}

/// List all saved book sources.
#[tauri::command]
pub fn list_book_sources(
    state: State<'_, AppState>,
) -> Result<Vec<yeader_models::LegacyBookSource>, String> {
    let db = state.db.lock().unwrap();
    let repo = BookSourceRepo::new(&db);
    repo.list_all().map_err(|e| e.to_string())
}

/// Delete a book source by its URL.
#[tauri::command]
pub fn delete_book_source(state: State<'_, AppState>, url: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = BookSourceRepo::new(&db);
    repo.delete(&url).map_err(|e| e.to_string())
}

/// Toggle a book source's enabled state.
#[tauri::command]
pub fn toggle_book_source(
    state: State<'_, AppState>,
    url: String,
    enabled: bool,
) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let repo = BookSourceRepo::new(&db);
    repo.set_enabled(&url, enabled).map_err(|e| e.to_string())
}

/// Convert a LegacyBookSource to a YeaderSource via the From impl, then save.
#[tauri::command]
pub fn convert_book_source(
    state: State<'_, AppState>,
    url: String,
) -> Result<YeaderSource, String> {
    let db = state.db.lock().unwrap();
    let book_repo = BookSourceRepo::new(&db);
    let source = book_repo
        .find_by_url(&url)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("book source not found: {}", url))?;

    let native: YeaderSource = (&source).into();
    let yeader_repo = YeaderSourceRepo::new(&db);
    yeader_repo.upsert(&native).map_err(|e| e.to_string())?;
    Ok(native)
}
