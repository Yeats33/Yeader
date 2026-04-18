use tauri::State;

use crate::state::SharedState;

#[tauri::command]
pub async fn import_backup(
    path: String,
    state: State<'_, SharedState>,
) -> Result<yeader_backup::ImportSummary, String> {
    // STUB: will be implemented after library extension
    Err("Not yet implemented".into())
}
