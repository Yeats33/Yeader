use tauri::State;
use tracing::{info, warn};
use yeader_models::{BookInfo as ModelBookInfo, Chapter as ModelChapter};

use crate::state::AppState;

#[tauri::command]
pub async fn fetch_book_info(
    state: State<'_, AppState>,
    book_url: String,
    source_url: String,
) -> Result<ModelBookInfo, String> {
    info!("fetch_book_info called: book_url={}, source_url={}", book_url, source_url);

    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                warn!("fetch_book_info: source not found: {}", source_url);
                format!("Book source not found: {}", source_url)
            })?
    };

    let resolved_url = yeader_net::resolve_book_url(&source, &book_url);
    info!("fetch_book_info: resolved_url={}", resolved_url);

    let client = yeader_net::HttpClient::new();
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!("fetch_book_info HTTP failed: resolved={}, error={}", resolved_url, e);
            format!("HTTP error: {}", e)
        })?;

    info!("fetch_book_info: got body len={}", response.body.len());
    let preview: String = response.body.chars().take(200).collect();
    info!("fetch_book_info: body preview: {}", preview);
    let info = yeader_reader::fetch_book_info(&source, &book_url, &response.body);
    info!("fetch_book_info: parsed info: title={}, toc_url={}, has_rule={}", info.title, info.toc_url, source.rule_book_info.is_some());
    if source.rule_book_info.is_some() {
        info!("fetch_book_info: rule init={:?}, name={:?}, toc_url={:?}",
            source.rule_book_info.as_ref().and_then(|r| r.init.as_ref()),
            source.rule_book_info.as_ref().and_then(|r| r.name.as_ref()),
            source.rule_book_info.as_ref().and_then(|r| r.toc_url.as_ref()));
    }

    Ok(ModelBookInfo {
        name: info.title,
        author: info.author,
        intro: Some(info.intro),
        kind: Some(info.kind),
        cover_url: Some(info.cover_url),
        toc_url: Some(info.toc_url),
        last_chapter: Some(info.last_chapter),
        word_count: Some(info.word_count),
    })
}

#[tauri::command]
pub async fn fetch_toc(
    state: State<'_, AppState>,
    toc_url: String,
    source_url: String,
) -> Result<Vec<ModelChapter>, String> {
    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Book source not found: {}", source_url))?
    };

    let client = yeader_net::HttpClient::new();
    let resolved_url = yeader_net::resolve_book_url(&source, &toc_url);
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!("fetch_toc HTTP failed: resolved={}, error={}", resolved_url, e);
            format!("HTTP error: {}", e)
        })?;

    let chapters = yeader_reader::fetch_toc(&source, &toc_url, &toc_url, &response.body);

    Ok(chapters
        .into_iter()
        .map(|ch| ModelChapter {
            title: ch.title,
            url: ch.url,
            is_volume: ch.is_volume,
            is_vip: ch.is_vip,
            is_pay: ch.is_pay,
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_content(
    state: State<'_, AppState>,
    chapter_url: String,
    source_url: String,
) -> Result<String, String> {
    // Look up the book source
    let source = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookSourceRepo::new(&db);
        repo.find_by_url(&source_url)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Book source not found: {}", source_url))?
    };

    let client = yeader_net::HttpClient::new();
    let resolved_url = yeader_net::resolve_book_url(&source, &chapter_url);
    let response = client
        .get(&resolved_url, &yeader_net::header_map_from_source(&source))
        .await
        .map_err(|e| {
            warn!(
                "fetch_content HTTP failed: resolved={}, error={}",
                resolved_url, e
            );
            format!("HTTP error: {}", e)
        })?;

    let content =
        yeader_reader::fetch_content(&source, &chapter_url, &response.body, &[]);

    Ok(content)
}

#[tauri::command]
pub async fn import_epub(
    state: State<'_, AppState>,
    path: String,
) -> Result<yeader_models::Book, String> {
    use std::path::Path;
    use yeader_reader::epub::read_epub;
    use uuid::Uuid;

    // Validate file exists
    let source_path = Path::new(&path);
    if !source_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Generate unique ID and create per-book directory
    let book_id = Uuid::new_v4().to_string();
    let book_dir = state.log_dir.join("epub_library").join(&book_id);
    std::fs::create_dir_all(&book_dir).map_err(|e| e.to_string())?;

    // Read and parse EPUB
    let epub_book = read_epub(source_path).map_err(|e| format!("Failed to parse EPUB: {}", e))?;

    // Copy epub file
    let dest_path = book_dir.join(format!("{}.epub", book_id));
    std::fs::copy(&path, &dest_path).map_err(|e| format!("Failed to copy EPUB: {}", e))?;

    // Encode cover as base64 data URL
    let cover_url = epub_book.cover_data.as_ref().map(|cover_entry| {
        let mime = match cover_entry.media_type.as_str() {
            m if m.starts_with("image/jpeg") || m.starts_with("image/jpg") => "image/jpeg",
            m if m.starts_with("image/png") => "image/png",
            m if m.starts_with("image/webp") => "image/webp",
            m if m.starts_with("image/gif") => "image/gif",
            _ => &cover_entry.media_type,
        };
        let b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &cover_entry.data,
        );
        format!("data:{};base64,{}", mime, b64)
    });

    // Save cover image file to disk as well
    if let Some(cover_entry) = &epub_book.cover_data {
        let ext = match cover_entry.media_type.as_str() {
            m if m.starts_with("image/jpeg") || m.starts_with("image/jpg") => "jpg",
            m if m.starts_with("image/png") => "png",
            m if m.starts_with("image/webp") => "webp",
            m if m.starts_with("image/gif") => "gif",
            _ => "bin",
        };
        let cover_file_path = book_dir.join(format!("cover.{}", ext));
        std::fs::write(&cover_file_path, &cover_entry.data)
            .map_err(|e| format!("Failed to write cover: {}", e))?;
    }

    // Create Book record
    let book = yeader_models::Book {
        url: format!("local://epub/{}", book_id),
        name: epub_book.title,
        author: epub_book.author,
        cover_url, // base64 data URL
        source_url: "local://epub".to_string(),
        toc_url: None,
        last_read_at: Some(chrono::Utc::now().to_rfc3339()),
        group_id: None,
        book_type: Some("epub".to_string()),
        intro: None,
        extra: {
            let mut map = serde_json::Map::new();
            map.insert(
                "epub_path".to_string(),
                serde_json::json!(dest_path.to_string_lossy().to_string()),
            );
            if epub_book.cover_data.is_some() {
                map.insert(
                    "cover_path".to_string(),
                    serde_json::json!(book_dir.join("cover.bin").to_string_lossy().to_string()),
                );
            }
            map.insert(
                "chapter_count".to_string(),
                serde_json::json!(epub_book.chapters.len()),
            );
            map
        },
    };

    // Save to database
    {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.upsert(&book).map_err(|e| e.to_string())?;
    }

    Ok(book)
}

#[tauri::command]
pub async fn list_local_epubs(
    state: State<'_, AppState>,
) -> Result<Vec<yeader_models::Book>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    let all_books = repo.list_all().map_err(|e| e.to_string())?;
    Ok(all_books
        .into_iter()
        .filter(|b| b.source_url == "local://epub")
        .collect())
}

#[tauri::command]
pub async fn read_local_epub(
    state: State<'_, AppState>,
    book_url: String,
    chapter_index: usize,
) -> Result<String, String> {
    use yeader_reader::epub::read_epub;

    // Find book in database
    let book = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.find_by_url(&book_url)
            .map_err(|e| e.to_string())?
            .ok_or("Book not found")?
    };

    // Get epub path from extra
    let epub_path = book
        .extra
        .get("epub_path")
        .and_then(|v| v.as_str())
        .ok_or("EPUB path not found in book metadata")?;

    // Read EPUB
    let epub_book =
        read_epub(std::path::Path::new(epub_path)).map_err(|e| format!("Failed to read EPUB: {}", e))?;

    // Return chapter content
    epub_book
        .chapters
        .get(chapter_index)
        .map(|ch| ch.content.clone())
        .ok_or_else(|| format!("Chapter {} not found", chapter_index))
}

#[tauri::command]
pub async fn delete_local_epub(
    state: State<'_, AppState>,
    book_url: String,
) -> Result<bool, String> {
    // Find book
    let book = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.find_by_url(&book_url)
            .map_err(|e| e.to_string())?
            .ok_or("Book not found")?
    };

    // Delete book directory (contains epub and cover)
    if let Some(epub_path) = book.extra.get("epub_path").and_then(|v| v.as_str()) {
        let book_dir = std::path::Path::new(epub_path).parent();
        if let Some(dir) = book_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    // Delete from database
    {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.delete(&book_url).map_err(|e| e.to_string())?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_epub_toc(
    state: State<'_, AppState>,
    book_url: String,
) -> Result<Vec<yeader_models::Chapter>, String> {
    use yeader_reader::epub::read_epub;

    let book = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.find_by_url(&book_url)
            .map_err(|e| e.to_string())?
            .ok_or("Book not found")?
    };

    let epub_path = book
        .extra
        .get("epub_path")
        .and_then(|v| v.as_str())
        .ok_or("EPUB path not found")?;

    let epub_book =
        read_epub(std::path::Path::new(epub_path)).map_err(|e| format!("Failed to read EPUB: {}", e))?;

    let chapters: Vec<yeader_models::Chapter> = epub_book
        .chapters
        .into_iter()
        .map(|ch| yeader_models::Chapter {
            title: ch.title.unwrap_or_default(),
            url: ch.href,
            is_volume: false,
            is_vip: false,
            is_pay: false,
        })
        .collect();

    Ok(chapters)
}
