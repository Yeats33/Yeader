use serde::Serialize;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ImportSummary {
    pub book_sources_count: usize,
    pub rss_sources_count: usize,
    pub replace_rules_count: usize,
}

#[tauri::command]
pub async fn import_backup(
    path: String,
    state: State<'_, AppState>,
) -> Result<ImportSummary, String> {
    let bundle =
        yeader_backup::load_backup(&path).map_err(|e| format!("Failed to load backup: {e}"))?;

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let book_sources_count = {
        let repo = yeader_library::BookSourceRepo::new(&db);
        let count = bundle.book_sources.len();
        repo.upsert_batch(&bundle.book_sources)
            .map_err(|e| format!("Failed to import book sources: {e}"))?;
        count
    };

    let rss_sources_count = {
        let repo = yeader_library::RssSourceRepo::new(&db);
        let count = bundle.rss_sources.len();
        repo.upsert_batch(&bundle.rss_sources)
            .map_err(|e| format!("Failed to import RSS sources: {e}"))?;
        count
    };

    let replace_rules_count = {
        let repo = yeader_library::ReplaceRuleRepo::new(&db);
        let count = bundle.replace_rules.len();
        repo.upsert_batch(&bundle.replace_rules)
            .map_err(|e| format!("Failed to import replace rules: {e}"))?;
        count
    };

    Ok(ImportSummary {
        book_sources_count,
        rss_sources_count,
        replace_rules_count,
    })
}
