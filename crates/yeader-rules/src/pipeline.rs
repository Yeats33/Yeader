//! Book search and content extraction pipeline.
//!
//! Orchestrates HTTP requests and rule evaluation to fetch and parse
//! book search results, book info, table of contents, and chapter content.

use yeader_models::LegacyBookSource;
use yeader_net::{analyze_url, HttpClient, Method};

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
        Method::GET => {
            client.get(&analyzed.url, &analyzed.headers).await?
        }
        Method::POST => {
            if let Some(ref body) = analyzed.body {
                client.post_json(&analyzed.url, body, &analyzed.headers).await?
            } else {
                client.post_form(&analyzed.url, "", &analyzed.headers).await?
            }
        }
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

    #[error("HTTP request failed: {0}")]
    HttpRequest(#[source] yeader_net::client::HttpError),
}

impl From<yeader_net::client::HttpError> for PipelineError {
    fn from(e: yeader_net::client::HttpError) -> Self {
        PipelineError::HttpRequest(e)
    }
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