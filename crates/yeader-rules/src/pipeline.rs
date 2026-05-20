//! Book search and content extraction pipeline.
//!
//! Orchestrates HTTP requests and rule evaluation to fetch and parse
//! book search results, book info, table of contents, and chapter content.

use yeader_models::LegacyBookSource;
use yeader_net::{HttpClient, Method, analyze_url};

use crate::analyzer::AnalyzeRule;

/// A detailed search result extracted from a book source.
#[derive(Debug, Clone)]
pub struct BookSearchResult {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

/// Book info extracted from a detail page.
#[derive(Debug, Clone)]
pub struct BookInfoResult {
    pub name: String,
    pub author: String,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
    pub download_urls: Vec<String>,
}

/// A chapter in a table of contents.
#[derive(Debug, Clone)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_vip: bool,
    pub is_pay: bool,
    pub update_time: Option<String>,
}

/// Chapter content result.
#[derive(Debug, Clone)]
pub struct ContentResult {
    pub content: String,
    pub title: Option<String>,
    pub next_url: Option<String>,
}

/// Search for books using a legacy book source.
///
/// # Arguments
/// * `client` - HTTP client for making requests
/// * `source` - Legacy book source with search URL and rules
/// * `keyword` - Search keyword
/// * `page` - Page number (1-indexed)
///
/// # Returns
/// List of search results extracted using the source's ruleSearch rules.
pub async fn search_books(
    client: &HttpClient,
    source: &LegacyBookSource,
    keyword: &str,
    page: i32,
) -> Result<Vec<BookSearchResult>, PipelineError> {
    // Get search URL from source
    let search_url = source
        .search_url
        .as_ref()
        .ok_or(PipelineError::MissingSearchUrl)?;

    // Analyze the URL to get method, headers, body
    let analyzed = analyze_url(search_url, keyword, page, &source.book_source_url)
        .map_err(PipelineError::UrlAnalysis)?;

    // Make HTTP request
    let response = match analyzed.method {
        Method::GET => client.get(&analyzed.url, &analyzed.headers).await?,
        Method::POST => {
            if let Some(ref body) = analyzed.body {
                client
                    .post_json(&analyzed.url, body, &analyzed.headers)
                    .await?
            } else {
                client
                    .post_form(&analyzed.url, "", &analyzed.headers)
                    .await?
            }
        }
        Method::HEAD => client.head(&analyzed.url, &analyzed.headers).await?,
    };

    // Create analyzer with response body
    let analyzer = AnalyzeRule::new(&response.body, &response.url);

    // Get rule_search
    let rule_search = source
        .rule_search
        .as_ref()
        .ok_or(PipelineError::MissingSearchRule)?;

    // Get book list elements
    let book_list_rule = rule_search
        .book_list
        .as_ref()
        .ok_or(PipelineError::MissingBookListRule)?;

    let book_elements = analyzer.get_elements(book_list_rule);

    // Extract fields from each book element
    let mut results = Vec::new();
    for element in book_elements {
        let element_analyzer = AnalyzeRule::from_content(element, analyzer.base_url());

        let name = element_analyzer
            .get_string(rule_search.name.as_deref().unwrap_or(""))
            .trim()
            .to_string();

        let author = element_analyzer
            .get_string(rule_search.author.as_deref().unwrap_or(""))
            .trim()
            .to_string();

        let book_url = element_analyzer
            .get_string(rule_search.book_url.as_deref().unwrap_or(""))
            .trim()
            .to_string();

        // Skip if no valid book URL
        if book_url.is_empty() {
            continue;
        }

        let cover_url = rule_search
            .cover_url
            .as_ref()
            .map(|rule| element_analyzer.get_string(rule).trim().to_string())
            .filter(|s| !s.is_empty());

        let intro = rule_search
            .intro
            .as_ref()
            .map(|rule| element_analyzer.get_string(rule).trim().to_string())
            .filter(|s| !s.is_empty());

        let kind = rule_search
            .kind
            .as_ref()
            .map(|rule| element_analyzer.get_string(rule).trim().to_string())
            .filter(|s| !s.is_empty());

        let last_chapter = rule_search
            .last_chapter
            .as_ref()
            .map(|rule| element_analyzer.get_string(rule).trim().to_string())
            .filter(|s| !s.is_empty());

        let word_count = rule_search
            .word_count
            .as_ref()
            .map(|rule| element_analyzer.get_string(rule).trim().to_string())
            .filter(|s| !s.is_empty());

        results.push(BookSearchResult {
            name,
            author,
            book_url,
            cover_url,
            intro,
            kind,
            last_chapter,
            word_count,
        });
    }

    Ok(results)
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("Book source has no searchUrl configured")]
    MissingSearchUrl,

    #[error("Failed to analyze search URL: {0}")]
    UrlAnalysis(#[source] yeader_net::url_analyzer::UrlAnalyzerError),

    #[error("Book source has no ruleSearch configured")]
    MissingSearchRule,

    #[error("ruleSearch.bookList rule is missing")]
    MissingBookListRule,

    #[error("Book source has no ruleBookInfo configured")]
    MissingBookInfoRule,

    #[error("Book source has no ruleToc configured")]
    MissingTocRule,

    #[error("ruleToc.chapterList rule is missing")]
    MissingChapterListRule,

    #[error("Book source has no ruleContent configured")]
    MissingContentRule,

    #[error("HTTP request failed: {0}")]
    HttpRequest(#[source] yeader_net::client::HttpError),
}

impl From<yeader_net::client::HttpError> for PipelineError {
    fn from(e: yeader_net::client::HttpError) -> Self {
        PipelineError::HttpRequest(e)
    }
}

/// Fetch detailed book info from a book's detail page.
///
/// Uses ruleBookInfo to extract name, author, intro, cover, TOC URL, etc.
pub async fn fetch_book_info(
    client: &HttpClient,
    source: &LegacyBookSource,
    book_url: &str,
) -> Result<BookInfoResult, PipelineError> {
    let rule_book_info = source
        .rule_book_info
        .as_ref()
        .ok_or(PipelineError::MissingBookInfoRule)?;

    let response = client.get(book_url, &Default::default()).await?;
    let analyzer = AnalyzeRule::new(&response.body, &response.url);

    // Execute init rule first if present (may set variables)
    if let Some(init) = rule_book_info.init.as_deref()
        && !init.is_empty()
    {
        analyzer.get_string(init);
    }

    let name = rule_book_info
        .name
        .as_ref()
        .map(|r| analyzer.get_string(r).trim().to_string())
        .unwrap_or_default();

    let author = rule_book_info
        .author
        .as_ref()
        .map(|r| analyzer.get_string(r).trim().to_string())
        .unwrap_or_default();

    let intro = rule_book_info.intro.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let kind = rule_book_info.kind.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let cover_url = rule_book_info.cover_url.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let toc_url = rule_book_info.toc_url.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let last_chapter = rule_book_info.last_chapter.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let word_count = rule_book_info.word_count.as_ref().and_then(|r| {
        let s = analyzer.get_string(r).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    });

    let download_urls: Vec<String> = if let Some(rule) = rule_book_info.download_urls.as_deref() {
        analyzer
            .get_string_list(rule)
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        Vec::new()
    };

    Ok(BookInfoResult {
        name,
        author,
        intro,
        kind,
        cover_url,
        toc_url,
        last_chapter,
        word_count,
        download_urls,
    })
}

/// Fetch table of contents (chapter list) for a book.
///
/// Uses ruleToc to extract chapters. Supports pagination via nextTocUrl.
pub async fn fetch_toc(
    client: &HttpClient,
    source: &LegacyBookSource,
    toc_url: &str,
) -> Result<Vec<Chapter>, PipelineError> {
    let rule_toc = source
        .rule_toc
        .as_ref()
        .ok_or(PipelineError::MissingTocRule)?;

    let mut all_chapters = Vec::new();
    let mut current_url = toc_url.to_string();

    loop {
        let response = client.get(&current_url, &Default::default()).await?;
        let analyzer = AnalyzeRule::new(&response.body, &response.url);

        let chapter_list_rule = rule_toc
            .chapter_list
            .as_ref()
            .ok_or(PipelineError::MissingChapterListRule)?;

        // Support reverse order prefix: "-:"
        let (reversed, list_rule): (bool, &str) =
            if let Some(rest) = chapter_list_rule.strip_prefix("-:") {
                (true, rest)
            } else {
                (false, chapter_list_rule.as_str())
            };

        let elements = analyzer.get_elements(list_rule);
        let chapter_elements = if reversed {
            elements.into_iter().rev().collect()
        } else {
            elements
        };

        for element in chapter_elements {
            let elem_analyzer = AnalyzeRule::from_content(element, analyzer.base_url());

            let title = rule_toc
                .chapter_name
                .as_ref()
                .map(|r| elem_analyzer.get_string(r).trim().to_string())
                .unwrap_or_default();

            let url = rule_toc
                .chapter_url
                .as_ref()
                .map(|r| elem_analyzer.get_string(r).trim().to_string())
                .unwrap_or_default();

            if title.is_empty() || url.is_empty() {
                continue;
            }

            // isVip: null/false/0/"" = not VIP
            let is_vip = rule_toc
                .is_vip
                .as_ref()
                .map(|r| elem_analyzer.get_string(r).trim().to_string())
                .map(|v| !v.is_empty() && v != "0" && v != "false")
                .unwrap_or(false);

            // isPay: same logic
            let is_pay = rule_toc
                .is_pay
                .as_ref()
                .map(|r| elem_analyzer.get_string(r).trim().to_string())
                .map(|v| !v.is_empty() && v != "0" && v != "false")
                .unwrap_or(false);

            let update_time = rule_toc.update_time.as_ref().and_then(|r| {
                let s = elem_analyzer.get_string(r).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            });

            all_chapters.push(Chapter {
                title,
                url,
                is_vip,
                is_pay,
                update_time,
            });
        }

        // Check for next page
        let next_url = rule_toc.next_toc_url.as_ref().and_then(|r| {
            let s = analyzer.get_string(r).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

        match next_url {
            Some(url) if !url.is_empty() => {
                current_url = url;
            }
            _ => break,
        }
    }

    Ok(all_chapters)
}

/// Fetch chapter content.
///
/// Uses ruleContent to extract content. Supports pagination via nextContentUrl.
pub async fn fetch_content(
    client: &HttpClient,
    source: &LegacyBookSource,
    chapter_url: &str,
) -> Result<ContentResult, PipelineError> {
    let rule_content = source
        .rule_content
        .as_ref()
        .ok_or(PipelineError::MissingContentRule)?;

    let mut current_url = chapter_url.to_string();
    let mut accumulated = String::new();
    let mut last_title: Option<String> = None;

    loop {
        let response = client.get(&current_url, &Default::default()).await?;
        let analyzer = AnalyzeRule::new(&response.body, &response.url);

        // Extract title
        if let Some(title_rule) = rule_content.title.as_deref()
            && !title_rule.is_empty()
        {
            let t = analyzer.get_string(title_rule).trim().to_string();
            if !t.is_empty() && last_title.is_none() {
                last_title = Some(t);
            }
        }

        // Extract content using source_regex first if present
        let content_rule = rule_content.content.as_deref().unwrap_or("");

        let text = if let Some(regex) = rule_content.source_regex.as_deref() {
            if !regex.is_empty() {
                let matches = analyzer.get_string_list(regex);
                matches.join("\n")
            } else {
                analyzer.get_string(content_rule)
            }
        } else {
            analyzer.get_string(content_rule)
        };

        if !text.is_empty() {
            if !accumulated.is_empty() {
                accumulated.push('\n');
            }
            accumulated.push_str(&text);
        }

        // Check for next page
        let next_url = rule_content.next_content_url.as_ref().and_then(|r| {
            let s = analyzer.get_string(r).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

        match next_url {
            Some(url) if !url.is_empty() => {
                current_url = url;
            }
            _ => break,
        }
    }

    Ok(ContentResult {
        content: accumulated,
        title: last_title,
        next_url: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a mock HTTP server or recorded responses.
    // For unit testing, we focus on the rule extraction logic.

    #[test]
    fn test_search_result_struct() {
        let result = BookSearchResult {
            name: "Test Book".to_string(),
            author: "Test Author".to_string(),
            book_url: "https://example.com/book/1".to_string(),
            cover_url: Some("https://example.com/cover.jpg".to_string()),
            intro: Some("A test book".to_string()),
            kind: Some("Fantasy".to_string()),
            last_chapter: Some("Chapter 100".to_string()),
            word_count: Some("100000".to_string()),
        };

        assert_eq!(result.name, "Test Book");
        assert_eq!(result.author, "Test Author");
        assert_eq!(result.book_url, "https://example.com/book/1");
        assert!(result.cover_url.is_some());
    }
}
