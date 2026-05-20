use scraper::{ElementRef, Html};
use std::collections::BTreeMap;
use tauri::State;
use yeader_models::{
    BookInfo as ModelBookInfo, Chapter as ModelChapter, SearchResult, YeaderAction,
    YeaderActionKind, YeaderCapability, YeaderCapabilityKind, YeaderExploreCategory,
    YeaderSelector, YeaderSelectorEngine, YeaderSource,
};

use crate::state::AppState;

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

    let url = normalize_request_url(
        &request
            .url
            .replace("{{key}}", &urlencoding::encode(keyword)),
        source.homepage.as_deref(),
    );

    let headers = build_headers(source, &request.headers);
    let body = if request.method == "POST" {
        Some(
            request
                .body
                .as_deref()
                .unwrap_or("")
                .replace("{{key}}", &urlencoding::encode(keyword)),
        )
    } else {
        None
    };

    let response = perform_request(source, &url, &headers, body.as_deref()).await?;

    Ok(extract_listing_results(source, search_cap, &response.body))
}

/// Browse a source's `List` capability by category, optionally with order variables.
pub async fn explore_with_yeader_source(
    source: &YeaderSource,
    category: &str,
    variables: &BTreeMap<String, String>,
    page: i32,
) -> Result<Vec<SearchResult>, String> {
    let list_cap = source
        .capabilities
        .iter()
        .find(|c| c.kind == YeaderCapabilityKind::List)
        .ok_or("Source has no list capability")?;

    let request = list_cap
        .request
        .as_ref()
        .ok_or("List capability has no request")?;

    let mut substituted = request.url.clone();
    let category_entry = source.explore_categories.iter().find(|c| c.key == category);
    if let Some(entry) = category_entry {
        for (key, value) in &entry.variables {
            substituted = substituted.replace(&format!("{{{{{}}}}}", key), value);
        }
    }
    for (key, value) in variables {
        substituted = substituted.replace(&format!("{{{{{}}}}}", key), value);
    }
    substituted = substituted
        .replace("{{category}}", category)
        .replace("{{page}}", &page.to_string());
    // Drop any unresolved placeholders so we don't issue a broken URL.
    let cleaned = strip_unresolved_placeholders(&substituted);
    let url = normalize_request_url(&cleaned, source.homepage.as_deref());

    let headers = build_headers(source, &request.headers);
    let response = perform_request(source, &url, &headers, None).await?;

    Ok(extract_listing_results(source, list_cap, &response.body))
}

fn strip_unresolved_placeholders(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("{{") {
        output.push_str(&rest[..start]);
        if let Some(end) = rest[start..].find("}}") {
            rest = &rest[start + end + 2..];
        } else {
            output.push_str(&rest[start..]);
            return output;
        }
    }
    output.push_str(rest);
    output
}

async fn perform_request(
    source: &YeaderSource,
    url: &str,
    headers: &reqwest::header::HeaderMap,
    post_form_body: Option<&str>,
) -> Result<yeader_net::HttpResponse, String> {
    match source.request_defaults.impersonate.as_deref() {
        Some(profile) if !profile.trim().is_empty() => {
            let client = yeader_net::shared_client(profile).map_err(describe_http_error)?;
            let wreq_headers = yeader_net::convert_headers(headers);
            if let Some(body) = post_form_body {
                client
                    .post_form(url, body, &wreq_headers)
                    .await
                    .map_err(describe_http_error)
            } else {
                client
                    .get(url, &wreq_headers)
                    .await
                    .map_err(describe_http_error)
            }
        }
        _ => {
            let client = yeader_net::HttpClient::new();
            if let Some(body) = post_form_body {
                client
                    .post_form(url, body, headers)
                    .await
                    .map_err(describe_http_error)
            } else {
                client.get(url, headers).await.map_err(describe_http_error)
            }
        }
    }
}

fn describe_http_error(error: yeader_net::HttpError) -> String {
    let raw = error.to_string();
    if raw.contains("403")
        && (raw.contains("challenges.cloudflare.com")
            || raw.contains("Just a moment")
            || raw.contains("cf-mitigated"))
    {
        return "该站点开启了 Cloudflare 防护，无法直接访问。请稍后再试或更换书源。".into();
    }
    format!("HTTP error: {}", raw)
}

/// Build a rule string for AnalyzeRule from a YeaderSelector.
fn selector_to_rule(selector: &YeaderSelector, default_output: &str) -> String {
    match selector.engine {
        YeaderSelectorEngine::Css => {
            let output = selector.output.as_deref().unwrap_or(default_output);
            let q = selector.query.trim();
            if q.is_empty() {
                format!("@{}", output)
            } else if has_extractor_suffix(q) {
                q.to_string()
            } else {
                format!("{}@{}", q, output)
            }
        }
        YeaderSelectorEngine::JsonPath => selector.query.clone(),
        YeaderSelectorEngine::XPath => selector.query.clone(),
        YeaderSelectorEngine::Regex => {
            let q = &selector.query;
            if q.starts_with("$(") && q.ends_with(')') {
                q.clone()
            } else {
                format!("$({})", q)
            }
        }
        YeaderSelectorEngine::JavaScript => {
            let q = &selector.query;
            if q.starts_with("@js:") || q.starts_with("<js>") {
                q.clone()
            } else {
                format!("@js:{}", q)
            }
        }
        YeaderSelectorEngine::Text => String::new(),
        YeaderSelectorEngine::LegacyLegado => selector.query.clone(),
    }
}

fn has_extractor_suffix(query: &str) -> bool {
    query.rfind('@').map_or(false, |pos| {
        let suffix = &query[pos + 1..];
        matches!(
            suffix,
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
    })
}

/// Extract an attribute from the root element of an HTML fragment.
fn extract_root_attr(html: &str, attr: &str) -> String {
    let document = Html::parse_fragment(html);
    document
        .root_element()
        .children()
        .filter_map(ElementRef::wrap)
        .next()
        .and_then(|el| el.value().attr(attr).map(String::from))
        .unwrap_or_default()
}

/// Execute a YeaderSelector against an AnalyzeRule, returning a single string.
fn execute_selector_string(
    analyzer: &yeader_rules::AnalyzeRule,
    selector: &YeaderSelector,
    default_output: &str,
) -> String {
    match selector.engine {
        YeaderSelectorEngine::Text => analyzer.text_content(),
        YeaderSelectorEngine::Css if selector.query.trim().is_empty() => {
            let output = selector.output.as_deref().unwrap_or(default_output);
            if output == "text" {
                analyzer.text_content()
            } else {
                extract_root_attr(analyzer.html_content(), output)
            }
        }
        _ => {
            let rule = selector_to_rule(selector, default_output);
            if rule.is_empty() {
                return String::new();
            }
            if selector.all {
                let results = analyzer.get_string_list(&rule);
                results.join("\n")
            } else {
                analyzer.get_string(&rule)
            }
        }
    }
}

/// Run BeforeExtract JS actions on an analyzer.
fn execute_before_extract_actions(
    analyzer: &mut yeader_rules::AnalyzeRule,
    actions: &[YeaderAction],
) {
    for action in actions {
        if action.kind == YeaderActionKind::BeforeExtract {
            let rule = format!("@js:{}", action.script);
            analyzer.get_string(&rule);
        }
    }
}

fn extract_listing_results(
    source: &YeaderSource,
    capability: &YeaderCapability,
    body: &str,
) -> Vec<SearchResult> {
    let mut analyzer =
        yeader_rules::AnalyzeRule::new(body, source.homepage.as_deref().unwrap_or(""));

    // Set source variables
    for (key, value) in &source.variables {
        analyzer.set_variable(key.clone(), value.clone());
    }

    // Execute BeforeExtract actions
    execute_before_extract_actions(&mut analyzer, &capability.actions);

    // Get item elements using the item selector, or use whole document
    let elements: Vec<yeader_rules::Content> = if let Some(item_sel) = &capability.item {
        let item_rule = selector_to_rule(item_sel, "html");
        analyzer.get_elements(&item_rule)
    } else {
        // No item selector — work with the whole document
        vec![yeader_rules::Content::Html(body.to_string())]
    };

    let mut results = Vec::new();
    for element in elements {
        let elem_analyzer = yeader_rules::AnalyzeRule::from_content(element, analyzer.base_url());

        let name = capability
            .fields
            .get("name")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        let author = capability
            .fields
            .get("author")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        let book_url = normalize_extracted_url(
            &capability
                .fields
                .get("bookUrl")
                .map(|s| execute_selector_string(&elem_analyzer, s, "href"))
                .unwrap_or_default(),
            source.homepage.as_deref(),
        );

        let cover_url = capability
            .fields
            .get("coverUrl")
            .map(|s| execute_selector_string(&elem_analyzer, s, "src"))
            .unwrap_or_default();

        let intro = capability
            .fields
            .get("intro")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        let kind = capability
            .fields
            .get("kind")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        let last_chapter = capability
            .fields
            .get("lastChapter")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        let word_count = capability
            .fields
            .get("wordCount")
            .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
            .unwrap_or_default();

        if !name.is_empty() || !book_url.is_empty() {
            results.push(SearchResult {
                source_id: source.id.clone(),
                name,
                author,
                book_url,
                cover_url: Some(cover_url).filter(|s| !s.is_empty()),
                intro: Some(intro).filter(|s| !s.is_empty()),
                kind: Some(kind).filter(|s| !s.is_empty()),
                last_chapter: Some(last_chapter).filter(|s| !s.is_empty()),
                word_count: Some(word_count).filter(|s| !s.is_empty()),
            });
        }
    }

    results
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

    let url = render_book_url_template(&request.url, book_url, source.homepage.as_deref());
    let headers = build_headers(source, &request.headers);
    let response = perform_request(source, &url, &headers, None).await?;

    let mut analyzer = yeader_rules::AnalyzeRule::new(&response.body, &response.url);
    for (key, value) in &source.variables {
        analyzer.set_variable(key.clone(), value.clone());
    }
    execute_before_extract_actions(&mut analyzer, &detail_cap.actions);

    // If there's an item selector, scope to first matching element
    let scoped = if let Some(item_sel) = &detail_cap.item {
        let item_rule = selector_to_rule(item_sel, "html");
        analyzer
            .get_elements(&item_rule)
            .into_iter()
            .next()
            .map(|el| yeader_rules::AnalyzeRule::from_content(el, analyzer.base_url()))
    } else {
        None
    };

    let active_analyzer = scoped.as_ref().unwrap_or(&analyzer);

    let name = detail_cap
        .fields
        .get("name")
        .map(|s| execute_selector_string(active_analyzer, s, "text"))
        .unwrap_or_default();

    let author = detail_cap
        .fields
        .get("author")
        .map(|s| execute_selector_string(active_analyzer, s, "text"))
        .unwrap_or_default();

    let cover_url = detail_cap
        .fields
        .get("coverUrl")
        .map(|s| {
            normalize_extracted_url(
                &execute_selector_string(active_analyzer, s, "src"),
                source.homepage.as_deref(),
            )
        })
        .unwrap_or_default();

    let intro = detail_cap
        .fields
        .get("intro")
        .map(|s| execute_selector_string(active_analyzer, s, "text"))
        .unwrap_or_default();

    let kind = detail_cap
        .fields
        .get("kind")
        .map(|s| execute_selector_string(active_analyzer, s, "text"))
        .unwrap_or_default();

    let toc_url = detail_cap
        .fields
        .get("tocUrl")
        .map(|s| {
            normalize_extracted_url(
                &execute_selector_string(active_analyzer, s, "href"),
                source.homepage.as_deref(),
            )
        })
        .unwrap_or_default();

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

    let url = render_book_url_template(&request.url, book_url, source.homepage.as_deref());
    let headers = build_headers(source, &request.headers);
    let response = perform_request(source, &url, &headers, None).await?;

    let mut analyzer = yeader_rules::AnalyzeRule::new(&response.body, &response.url);
    for (key, value) in &source.variables {
        analyzer.set_variable(key.clone(), value.clone());
    }
    execute_before_extract_actions(&mut analyzer, &toc_cap.actions);

    let item_sel = toc_cap
        .item
        .as_ref()
        .ok_or("TOC capability has no item selector")?;
    let item_rule = selector_to_rule(item_sel, "html");
    let elements = analyzer.get_elements(&item_rule);

    let chapters: Vec<ModelChapter> = elements
        .into_iter()
        .filter_map(|el| {
            let elem_analyzer = yeader_rules::AnalyzeRule::from_content(el, analyzer.base_url());

            let chapter_name = toc_cap
                .fields
                .get("chapterName")
                .map(|s| execute_selector_string(&elem_analyzer, s, "text"))
                .unwrap_or_default();

            let chapter_url = toc_cap
                .fields
                .get("chapterUrl")
                .map(|s| {
                    normalize_extracted_url(
                        &execute_selector_string(&elem_analyzer, s, "href"),
                        source.homepage.as_deref(),
                    )
                })
                .unwrap_or_default();

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
    let response = perform_request(source, &url, &headers, None).await?;

    let mut analyzer = yeader_rules::AnalyzeRule::new(&response.body, &response.url);
    for (key, value) in &source.variables {
        analyzer.set_variable(key.clone(), value.clone());
    }
    execute_before_extract_actions(&mut analyzer, &content_cap.actions);

    let content = content_cap
        .fields
        .get("content")
        .map(|s| execute_selector_string(&analyzer, s, "html"))
        .unwrap_or_default();

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
        && let Ok(base) = reqwest::Url::parse(homepage)
    {
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
        assert_eq!(source.publisher.as_deref(), Some("Yeats"));
        assert_eq!(
            source.donate_url.as_deref(),
            Some("ethereum:0x00000073a2c5581b9ea3d79261a567571Dd14E31")
        );

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
        let analyzer = yeader_rules::AnalyzeRule::new(html, "https://czbooks.net/");
        let item_sel = detail_cap.item.as_ref().unwrap();
        let item_rule = selector_to_rule(item_sel, "html");
        let elements = analyzer.get_elements(&item_rule);
        let detail_el = elements
            .into_iter()
            .next()
            .expect("detail element selected");
        let elem_analyzer = yeader_rules::AnalyzeRule::from_content(detail_el, analyzer.base_url());

        assert_eq!(
            execute_selector_string(
                &elem_analyzer,
                detail_cap.fields.get("name").unwrap(),
                "text"
            ),
            "《仙途無憂》"
        );
        assert_eq!(
            execute_selector_string(
                &elem_analyzer,
                detail_cap.fields.get("author").unwrap(),
                "text"
            ),
            "零貳"
        );
        assert_eq!(
            normalize_extracted_url(
                &execute_selector_string(
                    &elem_analyzer,
                    detail_cap.fields.get("coverUrl").unwrap(),
                    "src"
                ),
                source.homepage.as_deref(),
            ),
            "https://img.czbooks.net/thumbnail/cover.jpeg?1749449776"
        );
        assert_eq!(
            execute_selector_string(
                &elem_analyzer,
                detail_cap.fields.get("kind").unwrap(),
                "text"
            ),
            "女生同人"
        );
        assert!(
            execute_selector_string(
                &elem_analyzer,
                detail_cap.fields.get("intro").unwrap(),
                "text"
            )
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
        let analyzer = yeader_rules::AnalyzeRule::new(html, "https://czbooks.net/");
        let item_sel = toc_cap.item.as_ref().unwrap();
        let item_rule = selector_to_rule(item_sel, "html");
        let elements = analyzer.get_elements(&item_rule);
        let chapter_el = elements.into_iter().next().expect("chapter link selected");
        let elem_analyzer =
            yeader_rules::AnalyzeRule::from_content(chapter_el, analyzer.base_url());

        assert_eq!(
            execute_selector_string(
                &elem_analyzer,
                toc_cap.fields.get("chapterName").unwrap(),
                "text"
            ),
            "第一章 混沌世界"
        );
        assert_eq!(
            normalize_extracted_url(
                &execute_selector_string(
                    &elem_analyzer,
                    toc_cap.fields.get("chapterUrl").unwrap(),
                    "href"
                ),
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
        let analyzer = yeader_rules::AnalyzeRule::new(html, "https://czbooks.net/");
        let content_sel = content_cap
            .fields
            .get("content")
            .expect("content field exists");
        let content = execute_selector_string(&analyzer, content_sel, "html");

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
pub async fn list_explore_categories(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<Vec<YeaderExploreCategory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = yeader_library::YeaderSourceRepo::new(&db);
    let source = repo
        .find_by_id(&source_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Book source not found".to_string())?;
    Ok(source.explore_categories)
}

#[tauri::command]
pub async fn explore_books(
    state: State<'_, AppState>,
    source_id: String,
    category: String,
    variables: Option<BTreeMap<String, String>>,
    page: Option<i32>,
) -> Result<Vec<SearchResult>, String> {
    let source = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = yeader_library::YeaderSourceRepo::new(&db);
        repo.find_by_id(&source_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Book source not found".to_string())?
    };

    explore_with_yeader_source(
        &source,
        &category,
        &variables.unwrap_or_default(),
        page.unwrap_or(1),
    )
    .await
}
