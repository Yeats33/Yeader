use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

pub const DATA_DIR_ENV: &str = "YEADER_DATA_DIR";

pub fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(path) = std::env::var_os(DATA_DIR_ENV).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }

    Ok(app.path().document_dir()?.join("Yeader"))
}

pub fn migrate_legacy_data_dir(legacy_dir: &Path, data_dir: &Path) -> std::io::Result<()> {
    copy_file_if_missing(&legacy_dir.join("yeader.db"), &data_dir.join("yeader.db"))?;
    copy_dir_if_missing(
        &legacy_dir.join("epub_library"),
        &data_dir.join("epub_library"),
    )?;
    copy_dir_if_missing(&legacy_dir.join("so-novel"), &data_dir.join("so-novel"))?;
    Ok(())
}

fn copy_file_if_missing(source: &Path, dest: &Path) -> std::io::Result<()> {
    if !source.exists() || dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(source, dest)?;
    Ok(())
}

fn copy_dir_if_missing(source: &Path, dest: &Path) -> std::io::Result<()> {
    if !source.exists() || dest.exists() {
        return Ok(());
    }
    copy_dir_recursive(source, dest)
}

fn copy_dir_recursive(source: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &dest_path)?;
        } else {
            copy_file_if_missing(&source_path, &dest_path)?;
        }
    }
    Ok(())
}
