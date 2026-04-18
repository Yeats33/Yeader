use log::info;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use yeader_models::{CompatImportArtifact, LegacyBookSource, LegacyRssSource, LegacyReplaceRule};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Yeader starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            parse_legado_import_uri,
            list_book_sources,
            list_rss_sources,
            list_replace_rules,
            delete_book_source,
            list_books,
            add_book_to_shelf,
            remove_book,
            search_books,
            fetch_book_info,
            fetch_toc,
            fetch_content,
            get_reading_progress,
            save_reading_progress,
            import_backup,
        ])
        .setup(|app| {
            info!("Yeader initialized successfully");

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn parse_legado_import_uri(uri: &str) -> Result<CompatImportArtifact, String> {
    yeader_protocol::parse_legado_import_uri(uri).map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub url: String,
    pub name: String,
    pub author: String,
    pub cover_url: Option<String>,
    pub source_url: String,
    pub toc_url: Option<String>,
    pub last_read_at: Option<String>,
    pub group_id: Option<i32>,
    #[serde(rename = "type")]
    pub book_type: Option<i32>,
    pub intro: Option<String>,
    pub total_chapters: Option<i32>,
    pub reading_chapter: Option<i32>,
    pub reading_progress: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
    pub is_vip: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub name: String,
    pub author: String,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub word_count: Option<String>,
    pub chapters: Option<Vec<Chapter>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub book_id: String,
    pub chapter_index: i32,
    pub scroll_progress: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub book_sources_count: i32,
    pub rss_sources_count: i32,
    pub replace_rules_count: i32,
}

#[tauri::command]
fn list_book_sources() -> Vec<LegacyBookSource> {
    vec![
        LegacyBookSource {
            book_source_url: "https://example.com/source1".to_string(),
            book_source_name: "示例书源1".to_string(),
            book_source_group: "默认".to_string(),
            enabled: true,
            enabled_explore: Some(true),
            explore_url: None,
            login_check_js: None,
            book_source_type: Some(0),
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
        },
        LegacyBookSource {
            book_source_url: "https://example.com/source2".to_string(),
            book_source_name: "示例书源2".to_string(),
            book_source_group: "默认".to_string(),
            enabled: false,
            enabled_explore: Some(false),
            explore_url: None,
            login_check_js: None,
            book_source_type: Some(0),
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
        },
    ]
}

#[tauri::command]
fn list_rss_sources() -> Vec<LegacyRssSource> {
    vec![]
}

#[tauri::command]
fn list_replace_rules() -> Vec<LegacyReplaceRule> {
    vec![]
}

#[tauri::command]
fn delete_book_source(_url: String) -> bool {
    true
}

#[tauri::command]
fn list_books() -> Vec<Book> {
    vec![
        Book {
            url: "https://example.com/book1".to_string(),
            name: "三体".to_string(),
            author: "刘慈欣".to_string(),
            cover_url: None,
            source_url: "https://example.com/source1".to_string(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            total_chapters: Some(80),
            reading_chapter: None,
            reading_progress: Some(45),
        },
        Book {
            url: "https://example.com/book2".to_string(),
            name: "雪中悍刀行".to_string(),
            author: "烽火戏诸侯".to_string(),
            cover_url: None,
            source_url: "https://example.com/source1".to_string(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            total_chapters: Some(300),
            reading_chapter: None,
            reading_progress: Some(102),
        },
        Book {
            url: "https://example.com/book3".to_string(),
            name: "置身事内".to_string(),
            author: "兰小欢".to_string(),
            cover_url: None,
            source_url: "https://example.com/source2".to_string(),
            toc_url: None,
            last_read_at: None,
            group_id: None,
            book_type: None,
            intro: None,
            total_chapters: None,
            reading_chapter: None,
            reading_progress: None,
        },
    ]
}

#[tauri::command]
fn add_book_to_shelf(_book: Book) -> bool {
    true
}

#[tauri::command]
fn remove_book(_url: String) -> bool {
    true
}

#[tauri::command]
fn search_books(_source_url: String, keyword: String, _page: i32) -> Vec<SearchResult> {
    if keyword.is_empty() {
        return vec![];
    }
    vec![
        SearchResult {
            name: format!("{}（搜索结果）", keyword),
            author: "示例作者".to_string(),
            book_url: "https://example.com/search/1".to_string(),
            cover_url: None,
            intro: Some("这是一本通过搜索找到的书".to_string()),
            kind: None,
            last_chapter: Some("第30章".to_string()),
            word_count: None,
        },
        SearchResult {
            name: format!("{}的另一本书", keyword),
            author: "另一位作者".to_string(),
            book_url: "https://example.com/search/2".to_string(),
            cover_url: None,
            intro: Some("这是另一本相关的书".to_string()),
            kind: None,
            last_chapter: None,
            word_count: None,
        },
    ]
}

#[tauri::command]
fn fetch_book_info(_book_url: String, _source_url: String) -> BookInfo {
    BookInfo {
        name: "书籍详情".to_string(),
        author: "作者".to_string(),
        intro: Some("书籍简介".to_string()),
        kind: None,
        last_chapter: None,
        update_time: None,
        cover_url: None,
        toc_url: None,
        word_count: None,
        chapters: Some(vec![]),
    }
}

#[tauri::command]
fn fetch_toc(_toc_url: String, _source_url: String) -> Vec<Chapter> {
    vec![]
}

#[tauri::command]
fn fetch_content(_chapter_url: String, _source_url: String) -> String {
    String::new()
}

#[tauri::command]
fn get_reading_progress(_book_id: String) -> Option<ReadingProgress> {
    None
}

#[tauri::command]
fn save_reading_progress(_progress: ReadingProgress) {}

#[tauri::command]
fn import_backup(_path: String) -> ImportSummary {
    ImportSummary {
        book_sources_count: 0,
        rss_sources_count: 0,
        replace_rules_count: 0,
    }
}
