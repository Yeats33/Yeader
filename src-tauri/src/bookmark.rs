use crate::model::BookMark;
use std::fs;
use std::path::Path;

/// Save bookmark to JSON file alongside the EPUB
pub async fn save_bookmark_to_local_storage(bookmark: &BookMark) -> Result<String, String> {
    let book_path = &bookmark.book_path;
    let epub_dir = Path::new(book_path)
        .parent()
        .ok_or_else(|| "Failed to get parent directory from book path".to_string())?;

    let mark_file_path = epub_dir.join("mark.json");

    if !mark_file_path.exists() {
        fs::File::create(&mark_file_path)
            .map_err(|e| format!("Failed to create bookmark file: {}", e))?;
    }

    let json_data = serde_json::to_string(bookmark)
        .map_err(|e| format!("Failed to serialize bookmark: {}", e))?;

    fs::write(&mark_file_path, json_data)
        .map_err(|e| format!("Failed to write bookmark to file: {}", e))?;

    Ok(mark_file_path.to_string_lossy().to_string())
}

/// Load bookmark from JSON file alongside the EPUB
pub async fn load_bookmark_from_local_storage(book_path: &str) -> Result<BookMark, String> {
    let epub_dir = Path::new(book_path)
        .parent()
        .ok_or_else(|| "Failed to get parent directory from book path".to_string())?;

    let mark_file_path = epub_dir.join("mark.json");

    if !mark_file_path.exists() {
        return Ok(BookMark::new(book_path.to_string()));
    }

    let json_data = fs::read_to_string(&mark_file_path)
        .map_err(|e| format!("Failed to read bookmark file: {}", e))?;

    let bookmark: BookMark = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to deserialize bookmark: {}", e))?;

    Ok(bookmark)
}
