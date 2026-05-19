use scraper::{ElementRef, Selector};
use serde::Serialize;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use yeader_models::{
    BookInfo as ModelBookInfo, Chapter as ModelChapter, LegacyBookSource, SearchResult,
    YeaderCapabilityKind, YeaderSelector, YeaderSelectorEngine, YeaderSource,
};

use crate::state::AppState;

const TEST_RESULT_BATCH_SIZE: usize = 10;
const TEST_COOLDOWN_SECS: u64 = 300;
const MAX_CONCURRENT_TESTS: usize = 20;

// ---------------------------------------------------------------------------
// Yeader-native execution
// ---------------------------------------------------------------------------

pub async fn search_with_yeader_source(
    source: &YeaderSource,
    keyword: &str,
    _page: i32,
) -> Result<Vec<SearchResult>, String> {
    let search_cap = source
        .capabilities
        .iter()
        .find(|c| c.kind == YeaderCapabilityKind::Search)
        .ok_or("Source has no search capability")?;

    let request = search_cap
        .request
        .as_ref()
        .ok_or("Search capability has no request")?;

    let client = yeader_net::HttpClient::new();
    let url = normalize_request_url(
        &request.url.replace("{{key}}", keyword),
        source.homepage.as_deref(),
    );

    let response = if request.method == "POST" {
        let headers = build_headers(source, &request.headers);
        let body = request
            .body
            .as_deref()
            .unwrap_or("")
            .replace("{{key}}", keyword);
        client
            .post_form(&url, &body, &headers)
            .await
            .map_err(|e| format!("HTTP error: {}", e))?
    } else {
        let headers = build_headers(source, &request.headers);
        client
            .get(&url, &headers)
            .await
            .map_err(|e| format!("HTTP error: {}", e))?
    };

    let analyzer = yeader_rules::CssAnalyzer::new(&response.body);

    let item_selector = search_cap
        .item
        .as_ref()
        .filter(|i| i.engine == YeaderSelectorEngine::Css)
        .map(|i| i.query.as_str())
        .unwrap_or(".line");

    let elements = analyzer.get_elements(item_selector);
    let fields = &search_cap.fields;

    let mut results = Vec::new();
    for el in elements {
        let name = extract_field(el, fields.get("name"), "text");
        let author = extract_field(el, fields.get("author"), "text");
        let book_url = normalize_extracted_url(
            &extract_field(el, fields.get("bookUrl"), "href"),
            source.homepage.as_deref(),
        );
        let cover_url = normalize_extracted_url(
            &extract_field(el, fields.get("coverUrl"), "src"),
            source.homepage.as_deref(),
        );
        let intro = extract_field(el, fields.get("intro"), "text");
        let kind = extract_field(el, fields.get("kind"), "text");

        if !name.is_empty() || !book_url.is_empty() {
            results.push(SearchResult {
                source_id: source.id.clone(),
                name,
                author,
                book_url,
                cover_url: Some(cover_url).filter(|s| !s.is_empty()),
                intro: Some(intro).filter(|s| !s.is_empty()),
                kind: Some(kind).filter(|s| !s.is_empty()),
                last_chapter: None,
                word_count: None,
            });
        }
    }

    Ok(results)
}

pub async fn fetch_book_info_yeader(
    source: &YeaderSource,
    book_url: &str,
) -> Result<ModelBookInfo, String> {
    let detail_cap = source
        .capabilities
        .iter()
        .find(|c| c.kind == YeaderCapabilityKind::Detail)
        .ok_or("Source has no detail capability")?;

    let request = detail_cap
        .request
        .as_ref()
        .ok_or("Detail capability has no request")?;

    let client = yeader_net::HttpClient::new();
    let url = render_book_url_template(&request.url, book_url, source.homepage.as_deref());
    let headers = build_headers(source, &request.headers);
    let response = client
        .get(&url, &headers)
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let analyzer = yeader_rules::CssAnalyzer::new(&response.body);

    let item_selector = detail_cap
        .item
        .as_ref()
        .filter(|i| i.engine == YeaderSelectorEngine::Css)
        .map(|i| i.query.as_str())
        .unwrap_or(".novel-detail");

    let elements = analyzer.get_elements(item_selector);
    let el = elements.first().ok_or("No detail element found")?;
    let fields = &detail_cap.fields;

    let name = extract_field(*el, fields.get("name"), "text");
    let author = extract_field(*el, fields.get("author"), "text");
    let cover_url = normalize_extracted_url(
        &extract_field(*el, fields.get("coverUrl"), "src"),
        source.homepage.as_deref(),
    );
    let intro = extract_field(*el, fields.get("intro"), "text");
    let kind = extract_field(*el, fields.get("kind"), "text");
    let toc_url = normalize_extracted_url(
        &extract_field(*el, fields.get("tocUrl"), "href"),
        source.homepage.as_deref(),
    );

    Ok(ModelBookInfo {
        name,
        author,
        intro: Some(intro).filter(|s| !s.is_empty()),
        kind: Some(kind).filter(|s| !s.is_empty()),
        cover_url: Some(cover_url).filter(|s| !s.is_empty()),
        toc_url: Some(toc_url).filter(|s| !s.is_empty()),
        last_chapter: None,
        word_count: None,
    })
}

pub async fn fetch_toc_yeader(
    source: &YeaderSource,
    book_url: &str,
) -> Result<Vec<ModelChapter>, String> {
    let toc_cap = source
        .capabilities
        .iter()
        .find(|c| c.kind == YeaderCapabilityKind::Toc)
        .ok_or("Source has no TOC capability")?;

    let request = toc_cap
        .request
        .as_ref()
        .ok_or("TOC capability has no request")?;

    let client = yeader_net::HttpClient::new();
    let url = render_book_url_template(&request.url, book_url, source.homepage.as_deref());
    let headers = build_headers(source, &request.headers);
    let response = client
        .get(&url, &headers)
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let analyzer = yeader_rules::CssAnalyzer::new(&response.body);
    let fields = &toc_cap.fields;

    let item_selector = toc_cap
        .item
        .as_ref()
        .filter(|i| i.engine == YeaderSelectorEngine::Css)
        .map(|i| i.query.as_str())
        .unwrap_or("#chapter-list li a");

    let elements = analyzer.get_elements(item_selector);

    let chapters: Vec<ModelChapter> = elements
        .into_iter()
        .filter_map(|el| {
            let chapter_name = extract_field(el, fields.get("chapterName"), "text");
            let chapter_url = normalize_extracted_url(
                &extract_field(el, fields.get("chapterUrl"), "href"),
                source.homepage.as_deref(),
            );

            if chapter_name.is_empty() && chapter_url.is_empty() {
                return None;
            }

            Some(ModelChapter {
                title: chapter_name,
                url: chapter_url,
                is_volume: false,
                is_vip: false,
                is_pay: false,
            })
        })
        .collect();

    Ok(chapters)
}

pub async fn fetch_content_yeader(
    source: &YeaderSource,
    chapter_url: &str,
    book_url: &str,
    chapter_index: Option<usize>,
) -> Result<String, String> {
    let content_cap = source
        .capabilities
        .iter()
        .find(|c| c.kind == YeaderCapabilityKind::Content)
        .ok_or("Source has no content capability")?;

    let client = yeader_net::HttpClient::new();

    let request = content_cap
        .request
        .as_ref()
        .ok_or("Content capability has no request")?;

    let mut url = request.url.clone();
    if let Some(idx) = chapter_index {
        url = url.replace("{{chapterIndex}}", &idx.to_string());
    }
    url = url.replace("{{bookId}}", &book_id_from_url(book_url));
    url = url.replace(
        "{{bookUrl}}",
        &normalize_extracted_url(book_url, source.homepage.as_deref()),
    );
    url = url.replace("{{chapterId}}", &chapter_id_from_url(chapter_url));
    url = url.replace(
        "{{chapterUrl}}",
        &normalize_extracted_url(chapter_url, source.homepage.as_deref()),
    );
    url = normalize_request_url(&url, source.homepage.as_deref());

    let headers = build_headers(source, &request.headers);
    let response = client
        .get(&url, &headers)
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let analyzer = yeader_rules::CssAnalyzer::new(&response.body);
    let fields = &content_cap.fields;

    let content_rule = fields
        .get("content")
        .filter(|s| s.engine == YeaderSelectorEngine::Css)
        .map(|selector| {
            let (query, extractor) = split_selector_and_extractor(
                &selector.query,
                selector.output.as_deref().unwrap_or("html"),
            );
            format!("{query}@{extractor}")
        })
        .unwrap_or_else(|| ".content@html".to_string());

    let content = analyzer.get_string(&content_rule);

    Ok(content)
}

fn build_headers(
    source: &YeaderSource,
    headers: &BTreeMap<String, String>,
) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
    let mut map = HeaderMap::new();
    for (k, v) in &source.request_defaults.headers {
        if let (Ok(name), Ok(val)) = (k.parse::<HeaderName>(), v.parse::<HeaderValue>()) {
            map.insert(name, val);
        }
    }
    for (k, v) in headers {
        if let (Ok(name), Ok(val)) = (k.parse::<HeaderName>(), v.parse::<HeaderValue>()) {
            map.insert(name, val);
        }
    }
    map
}

fn render_book_url_template(template: &str, book_url: &str, homepage: Option<&str>) -> String {
    let normalized_book_url = normalize_extracted_url(book_url, homepage);
    normalize_request_url(
        &template
            .replace("{{bookId}}", &book_id_from_url(book_url))
            .replace("{{bookUrl}}", &normalized_book_url),
        homepage,
    )
}

fn normalize_request_url(url: &str, homepage: Option<&str>) -> String {
    normalize_extracted_url(url, homepage)
}

fn normalize_extracted_url(value: &str, homepage: Option<&str>) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }
    if trimmed.starts_with('/')
        && let Some(homepage) = homepage
            && let Ok(base) = reqwest::Url::parse(homepage) {
                return format!(
                    "{}://{}{}",
                    base.scheme(),
                    base.host_str().unwrap_or_default(),
                    trimmed
                );
            }
    trimmed.to_string()
}

fn book_id_from_url(book_url: &str) -> String {
    path_segment_after_n(book_url).unwrap_or_else(|| book_url.trim().trim_matches('/').to_string())
}

fn chapter_id_from_url(chapter_url: &str) -> String {
    let path = chapter_url.split('?').next().unwrap_or(chapter_url);
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}

fn path_segment_after_n(raw_url: &str) -> Option<String> {
    let normalized = normalize_extracted_url(raw_url, Some("https://czbooks.net/"));
    let path = if let Ok(url) = reqwest::Url::parse(&normalized) {
        url.path().to_string()
    } else {
        normalized
    };
    let mut parts = path.split('/').filter(|part| !part.is_empty());
    while let Some(part) = parts.next() {
        if part == "n" {
            return parts.next().map(ToString::to_string);
        }
    }
    None
}

fn extract_field(
    el: ElementRef<'_>,
    selector: Option<&YeaderSelector>,
    default_extractor: &str,
) -> String {
    let Some(sel) = selector else {
        return String::new();
    };

    if sel.engine == YeaderSelectorEngine::Text {
        return extract_value(el, "text");
    }

    if sel.engine != YeaderSelectorEngine::Css {
        return String::new();
    }

    let (selector_text, extractor) = split_selector_and_extractor(
        &sel.query,
        sel.output.as_deref().unwrap_or(default_extractor),
    );
    let elements = if selector_text.trim().is_empty() {
        vec![el]
    } else {
        let Ok(selector) = Selector::parse(selector_text.trim()) else {
            return String::new();
        };
        el.select(&selector).collect::<Vec<_>>()
    };

    if sel.all {
        elements
            .into_iter()
            .map(|e| extract_value(e, extractor))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        elements
            .into_iter()
            .next()
            .map(|e| extract_value(e, extractor))
            .unwrap_or_default()
    }
}

fn split_selector_and_extractor<'a>(
    query: &'a str,
    default_extractor: &'a str,
) -> (&'a str, &'a str) {
    match query.rsplit_once('@') {
        Some((selector, extractor)) if is_extractor(extractor) => (selector, extractor),
        _ => (query, default_extractor),
    }
}

fn is_extractor(token: &str) -> bool {
    matches!(
        token,
        "text"
            | "textNodes"
            | "ownText"
            | "html"
            | "all"
            | "href"
            | "src"
            | "class"
            | "id"
            | "data-url"
    )
}

fn extract_value(element: ElementRef<'_>, extractor: &str) -> String {
    match extractor {
        "text" => element
            .text()
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string(),
        "textNodes" => element
            .text()
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
        "ownText" => element
            .children()
            .filter_map(|child| child.value().as_text().map(|text| text.text.to_string()))
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(""),
        "html" | "all" => element.inner_html(),
        attr => element.value().attr(attr).unwrap_or_default().to_string(),
    }
}

#[cfg(test)]
mod yeader_native_tests {
    use super::*;
    use yeader_models::parse_yeader_source_pack;

    fn czbooks_source() -> YeaderSource {
        parse_yeader_source_pack(include_str!("../../../sources/czbooks.net.json"))
            .expect("built-in source pack parses")
            .sources
            .into_iter()
            .find(|source| source.id == "czbooks-net")
            .expect("czbooks source exists")
    }

    #[test]
    fn czbooks_detail_selectors_match_current_dom() {
        let source = czbooks_source();
        let detail_cap = source
            .capabilities
            .iter()
            .find(|cap| cap.kind == YeaderCapabilityKind::Detail)
            .expect("detail capability exists");
        let html = r#"
            <div class="novel-detail">
              <div class="thumbnail">
                <img src="https://img.czbooks.net/thumbnail/cover.jpeg?1749449776">
              </div>
              <div class="state">
                <a id="novel-category" href="//czbooks.net/c/tongren">女生同人</a>
              </div>
              <div class="info-wrap">
                <div class="info">
                  <span class="title">《仙途無憂》</span>
                  <span class="author">作者: <a href="//czbooks.net/a/零貳">零貳</a></span>
                </div>
                <div class="description">混沌初開<br>她將踏紅塵萬里</div>
              </div>
            </div>
        "#;
        let analyzer = yeader_rules::CssAnalyzer::new(html);
        let detail_el = analyzer
            .get_elements(detail_cap.item.as_ref().unwrap().query.as_str())
            .into_iter()
            .next()
            .expect("detail element selected");

        assert_eq!(
            extract_field(detail_el, detail_cap.fields.get("name"), "text"),
            "《仙途無憂》"
        );
        assert_eq!(
            extract_field(detail_el, detail_cap.fields.get("author"), "text"),
            "零貳"
        );
        assert_eq!(
            normalize_extracted_url(
                &extract_field(detail_el, detail_cap.fields.get("coverUrl"), "src"),
                source.homepage.as_deref(),
            ),
            "https://img.czbooks.net/thumbnail/cover.jpeg?1749449776"
        );
        assert_eq!(
            extract_field(detail_el, detail_cap.fields.get("kind"), "text"),
            "女生同人"
        );
        assert!(
            extract_field(detail_el, detail_cap.fields.get("intro"), "text")
                .contains("她將踏紅塵萬里")
        );
    }

    #[test]
    fn czbooks_toc_selectors_return_absolute_chapter_urls() {
        let source = czbooks_source();
        let toc_cap = source
            .capabilities
            .iter()
            .find(|cap| cap.kind == YeaderCapabilityKind::Toc)
            .expect("toc capability exists");
        let html = r#"
            <ul class="nav chapter-list" id="chapter-list">
              <li class="volume">正文卷</li>
              <li><a href="//czbooks.net/n/cr79bh/crdic?chapterNumber=0">第一章 混沌世界</a></li>
            </ul>
        "#;
        let analyzer = yeader_rules::CssAnalyzer::new(html);
        let chapter_el = analyzer
            .get_elements(toc_cap.item.as_ref().unwrap().query.as_str())
            .into_iter()
            .next()
            .expect("chapter link selected");

        assert_eq!(
            extract_field(chapter_el, toc_cap.fields.get("chapterName"), "text"),
            "第一章 混沌世界"
        );
        assert_eq!(
            normalize_extracted_url(
                &extract_field(chapter_el, toc_cap.fields.get("chapterUrl"), "href"),
                source.homepage.as_deref(),
            ),
            "https://czbooks.net/n/cr79bh/crdic?chapterNumber=0"
        );
    }

    #[test]
    fn czbooks_content_selector_extracts_readable_html() {
        let source = czbooks_source();
        let content_cap = source
            .capabilities
            .iter()
            .find(|cap| cap.kind == YeaderCapabilityKind::Content)
            .expect("content capability exists");
        let html = r#"
            <div class="chapter-detail">
              <div class="name">《仙途無憂》第一章 混沌世界</div>
              <div class="content">上古时代<br><br>自此，古神族除白屿双尚在莲中。</div>
            </div>
        "#;
        let analyzer = yeader_rules::CssAnalyzer::new(html);
        let selector = content_cap
            .fields
            .get("content")
            .expect("content field exists");
        let (query, extractor) = split_selector_and_extractor(
            &selector.query,
            selector.output.as_deref().unwrap_or("html"),
        );
        let content = analyzer.get_string(&format!("{query}@{extractor}"));

        assert!(content.contains("上古时代"));
        assert!(content.contains("<br>"));
        assert!(content.contains("白屿双"));
    }

    #[test]
    fn czbooks_request_templates_accept_full_links() {
        let source = czbooks_source();
        assert_eq!(
            render_book_url_template(
                "{{bookUrl}}",
                "https://czbooks.net/n/cr79bh",
                source.homepage.as_deref(),
            ),
            "https://czbooks.net/n/cr79bh"
        );
        assert_eq!(
            normalize_extracted_url(
                "//czbooks.net/n/cr79bh/crdic?chapterNumber=0",
                source.homepage.as_deref()
            ),
            "https://czbooks.net/n/cr79bh/crdic?chapterNumber=0"
        );
        assert_eq!(book_id_from_url("https://czbooks.net/n/cr79bh"), "cr79bh");
        assert_eq!(
            chapter_id_from_url("https://czbooks.net/n/cr79bh/crdic?chapterNumber=0"),
            "crdic"
        );
    }

    #[tokio::test]
    #[ignore = "hits czbooks.net; run manually when validating the built-in source"]
    async fn czbooks_live_import_and_read() {
        let source = czbooks_source();
        let book_url = "https://czbooks.net/n/cr79bh";
        let first_chapter_url = "https://czbooks.net/n/cr79bh/crdic?chapterNumber=0";

        let info = fetch_book_info_yeader(&source, book_url)
            .await
            .expect("fetches book info");
        assert_eq!(info.name, "《仙途無憂》");
        assert_eq!(info.author, "零貳");
        assert_eq!(info.kind.as_deref(), Some("女生同人"));

        let chapters = fetch_toc_yeader(&source, book_url)
            .await
            .expect("fetches toc");
        assert!(chapters.len() > 300);
        assert_eq!(
            chapters.first().map(|chapter| chapter.title.as_str()),
            Some("第一章 混沌世界")
        );
        assert_eq!(
            chapters.first().map(|chapter| chapter.url.as_str()),
            Some(first_chapter_url)
        );

        let content = fetch_content_yeader(&source, first_chapter_url, book_url, Some(0))
            .await
            .expect("fetches first chapter content");
        assert!(content.contains("上古时代"));
        assert!(content.contains("白孤屿"));
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn search_books(
    state: State<'_, AppState>,
    source_id: String,
    keyword: String,
    _page: i32,
) -> Result<Vec<SearchResult>, String> {
    let source = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = yeader_library::YeaderSourceRepo::new(&db);
        repo.find_by_id(&source_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Book source not found".to_string())?
    };

    search_with_yeader_source(&source, &keyword, _page).await
}

#[tauri::command]
pub async fn test_book_sources_availability(
    _state: State<'_, AppState>,
    _source_urls: Option<Vec<String>>,
) -> Result<Vec<BookSourceAvailability>, String> {
    Ok(Vec::new())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSourceAvailability {
    pub source_url: String,
    pub available: bool,
    pub detail: Option<String>,
    pub tested_at: String,
}

#[allow(dead_code)]
pub async fn test_book_sources_availability_legacy(
    state: State<'_, AppState>,
    source_urls: Option<Vec<String>>,
) -> Result<Vec<BookSourceAvailability>, String> {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let (sources, skipped): (Vec<_>, Vec<(String, String)>) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = yeader_library::BookSourceRepo::new(&db);
        let all_sources: Vec<_> = match source_urls {
            Some(urls) => urls
                .iter()
                .filter_map(|url| {
                    repo.find_by_url(url)
                        .map_err(|e| e.to_string())
                        .ok()
                        .flatten()
                })
                .collect(),
            None => repo.list_all().map_err(|e| e.to_string())?,
        };

        let mut sources = Vec::new();
        let mut skipped = Vec::new();
        for source in all_sources {
            if let Some(ref last_tested) = source.last_tested_at
                && let Ok(last_secs) = last_tested.parse::<u64>()
                    && now_secs.saturating_sub(last_secs) < TEST_COOLDOWN_SECS {
                        skipped.push((source.book_source_url.clone(), last_tested.clone()));
                        continue;
                    }
            sources.push(source);
        }
        (sources, skipped)
    };

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_TESTS as _));
    let pending_persist = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::<(
        String,
        bool,
        Option<String>,
        String,
    )>::new()));
    let sources_len = sources.len();
    let mut handles = Vec::with_capacity(sources_len);

    for source in sources {
        let sem = semaphore.clone();
        let pending = pending_persist.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.ok();

            let (available, detail) = match search_impl(&source, "测试", 1).await {
                Ok(_) => (true, Some("请求和解析通过".to_string())),
                Err(error) => (false, Some(error)),
            };

            let tested_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "0".to_string());

            let result = BookSourceAvailability {
                source_url: source.book_source_url.clone(),
                available,
                detail,
                tested_at: tested_at.clone(),
            };

            pending.lock().await.push((
                source.book_source_url.clone(),
                available,
                result.detail.clone(),
                tested_at,
            ));

            result
        });
        handles.push(handle);
    }

    let mut results: Vec<_> = Vec::with_capacity(sources_len);
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }

    let to_persist = std::sync::Arc::try_unwrap(pending_persist)
        .expect("all handles dropped")
        .into_inner();

    for chunk in to_persist.chunks(TEST_RESULT_BATCH_SIZE) {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = yeader_library::BookSourceRepo::new(&db);
        let _ = repo.set_test_result_batch(chunk);
    }

    for (url, tested_at) in skipped {
        results.push(BookSourceAvailability {
            source_url: url,
            available: false,
            detail: Some("冷却中".to_string()),
            tested_at,
        });
    }

    Ok(results)
}

async fn search_impl(
    source: &LegacyBookSource,
    keyword: &str,
    page: i32,
) -> Result<Vec<SearchResult>, String> {
    let client = yeader_net::HttpClient::new();
    let results = yeader_rules::search_books(&client, source, keyword, page)
        .await
        .map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| SearchResult {
            source_id: source.book_source_url.clone(),
            name: r.name,
            author: r.author,
            book_url: r.book_url,
            cover_url: r.cover_url,
            intro: r.intro,
            kind: r.kind,
            last_chapter: r.last_chapter,
            word_count: r.word_count,
        })
        .collect())
}
