//! Main dispatcher for legado-style rule execution.
//!
//! Coordinates CSS, JSONPath, and regex engines based on rule mode detection.

use std::collections::HashMap;
use std::fmt;

use serde_json::Value;

use crate::css::CssAnalyzer;
use crate::json_path::{json_path_list, json_path_string_list};
use crate::regex::{apply_replace, regex_get_elements};
use crate::rule_parser::{split_source_rule, Mode, SourceRule};

/// Content type for rule execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Content {
    /// HTML content for CSS selection.
    Html(String),
    /// JSON content for JSONPath queries.
    Json(Value),
}

impl Content {
    fn is_html(&self) -> bool {
        matches!(self, Content::Html(_))
    }

    fn is_json(&self) -> bool {
        matches!(self, Content::Json(_))
    }

    fn as_str(&self) -> &str {
        match self {
            Content::Html(s) => s,
            Content::Json(v) => match v {
                Value::String(s) => s,
                _ => "",
            },
        }
    }

    fn as_json_value(&self) -> Option<&Value> {
        match self {
            Content::Json(v) => Some(v),
            _ => None,
        }
    }
}

impl fmt::Display for Content {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Content::Html(s) => write!(f, "{}", s),
            Content::Json(v) => write!(f, "{}", v),
        }
    }
}

/// Main rule analyzer coordinating CSS, JSONPath, and regex engines.
pub struct AnalyzeRule {
    content: Content,
    base_url: String,
    variables: HashMap<String, String>,
}

impl AnalyzeRule {
    /// Create a new analyzer with HTML content.
    pub fn new(content: &str, base_url: &str) -> Self {
        Self {
            content: Content::Html(content.to_string()),
            base_url: base_url.to_string(),
            variables: HashMap::new(),
        }
    }

    /// Create a new analyzer with JSON content.
    pub fn new_json(content: &str, base_url: &str) -> Self {
        let json: Value = serde_json::from_str(content).unwrap_or(Value::String(content.to_string()));
        Self {
            content: Content::Json(json),
            base_url: base_url.to_string(),
            variables: HashMap::new(),
        }
    }

    /// Create a new analyzer with pre-parsed JSON value.
    pub fn new_with_json(content: Value, base_url: &str) -> Self {
        Self {
            content: Content::Json(content),
            base_url: base_url.to_string(),
            variables: HashMap::new(),
        }
    }

    /// Set a variable for later retrieval via `@get:{key}`.
    pub fn set_variable(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.variables.insert(key.into(), value.into());
    }

    /// Get a variable value.
    pub fn get_variable(&self, key: &str) -> Option<&String> {
        self.variables.get(key)
    }

    /// Get the base URL.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Extract a single string using a rule.
    ///
    /// For chained rules (`&&`/`||`), only the first successful segment is returned.
    pub fn get_string(&self, rule: &str) -> String {
        let segments = self.split_chained_rules(rule);
        for seg in segments {
            if seg.starts_with("||") {
                continue;
            }
            if let Some(result) = self.try_get_string(seg.trim()) {
                return result;
            }
        }
        String::new()
    }

    /// Extract a list of strings using a rule.
    ///
    /// Chained rules with `||` are tried in order until one succeeds.
    pub fn get_string_list(&self, rule: &str) -> Vec<String> {
        let segments = self.split_chained_rules(rule);
        for seg in segments {
            if seg.starts_with("||") {
                continue;
            }
            if let Some(result) = self.try_get_string_list(seg.trim()) {
                return result;
            }
        }
        Vec::new()
    }

    /// Extract elements using a rule, returning raw content for each match.
    ///
    /// For HTML: returns Html wrappers around each matched element.
    /// For JSON: returns Json wrappers around each matched value.
    pub fn get_elements(&self, rule: &str) -> Vec<Content> {
        let segments = self.split_chained_rules(rule);
        for seg in segments {
            if seg.starts_with("||") {
                continue;
            }
            if let Some(result) = self.try_get_elements(seg.trim()) {
                return result;
            }
        }
        Vec::new()
    }

    fn split_chained_rules<'a>(&self, rule: &'a str) -> Vec<&'a str> {
        rule.split("&&")
            .map(|s| s.trim())
            .collect::<Vec<_>>()
    }

    fn try_get_string(&self, rule: &str) -> Option<String> {
        let source_rules = split_source_rule(rule);
        self.execute_source_rules_string(&source_rules)
    }

    fn try_get_string_list(&self, rule: &str) -> Option<Vec<String>> {
        let source_rules = split_source_rule(rule);
        self.execute_source_rules_string_list(&source_rules)
    }

    fn try_get_elements(&self, rule: &str) -> Option<Vec<Content>> {
        let source_rules = split_source_rule(rule);
        self.execute_source_rules_elements(&source_rules)
    }

    fn execute_source_rules_string(&self, rules: &[SourceRule]) -> Option<String> {
        if rules.is_empty() {
            return None;
        }

        let mut result: Option<String> = None;

        for source_rule in rules {
            let values = self.execute_single_rule(source_rule)?;
            if values.is_empty() {
                continue;
            }
            let joined = values.join("\n");
            let processed = self.apply_post_processing(&joined, source_rule);
            result = Some(processed);
            break;
        }

        result
    }

    fn execute_source_rules_string_list(&self, rules: &[SourceRule]) -> Option<Vec<String>> {
        if rules.is_empty() {
            return None;
        }

        for source_rule in rules {
            let values = self.execute_single_rule(source_rule)?;
            if values.is_empty() {
                continue;
            }
            let processed: Vec<String> = values
                .into_iter()
                .map(|v| self.apply_post_processing(&v, source_rule))
                .collect();
            return Some(processed);
        }

        None
    }

    fn execute_source_rules_elements(&self, rules: &[SourceRule]) -> Option<Vec<Content>> {
        if rules.is_empty() {
            return None;
        }

        for source_rule in rules {
            let elements = self.execute_single_rule_elements(source_rule)?;
            if elements.is_empty() {
                continue;
            }
            return Some(elements);
        }

        None
    }

    fn execute_single_rule(&self, source_rule: &SourceRule) -> Option<Vec<String>> {
        match source_rule.mode {
            Mode::Default | Mode::Css => {
                if self.content.is_html() {
                    let css = CssAnalyzer::new(self.content.as_str());
                    Some(css.get_string_list(&source_rule.rule))
                } else {
                    None
                }
            }
            Mode::Json => {
                if self.content.is_json() {
                    let json_str = self.content.as_json_value()?.to_string();
                    Some(json_path_string_list(&json_str, &source_rule.rule))
                } else {
                    None
                }
            }
            Mode::Regex => {
                let values = regex_get_elements(self.content.as_str(), &[&source_rule.rule]);
                if values.is_empty() {
                    None
                } else {
                    Some(values)
                }
            }
            Mode::Js | Mode::XPath => {
                // Js and XPath modes are not yet implemented
                None
            }
        }
    }

    fn execute_single_rule_elements(&self, source_rule: &SourceRule) -> Option<Vec<Content>> {
        match source_rule.mode {
            Mode::Default | Mode::Css => {
                if self.content.is_html() {
                    let css = CssAnalyzer::new(self.content.as_str());
                    let elements: Vec<Content> = css
                        .get_elements(&source_rule.rule)
                        .into_iter()
                        .map(|e| Content::Html(e.inner_html()))
                        .collect();
                    if elements.is_empty() {
                        None
                    } else {
                        Some(elements)
                    }
                } else {
                    None
                }
            }
            Mode::Json => {
                if self.content.is_json() {
                    let json_str = self.content.as_json_value()?.to_string();
                    let values = json_path_list(&json_str, &source_rule.rule);
                    let elements: Vec<Content> = values
                        .into_iter()
                        .map(|v| Content::Json(v))
                        .collect();
                    if elements.is_empty() {
                        None
                    } else {
                        Some(elements)
                    }
                } else {
                    None
                }
            }
            Mode::Regex => {
                let values = regex_get_elements(self.content.as_str(), &[&source_rule.rule]);
                if values.is_empty() {
                    None
                } else {
                    Some(values.into_iter().map(Content::Html).collect())
                }
            }
            Mode::Js | Mode::XPath => {
                None
            }
        }
    }

    fn apply_post_processing(&self, text: &str, source_rule: &SourceRule) -> String {
        if source_rule.replace_regex.is_empty() {
            text.to_string()
        } else {
            apply_replace(
                text,
                &source_rule.replace_regex,
                &source_rule.replacement,
                source_rule.replace_first,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEARCH_HTML: &str = r#"<!DOCTYPE html>
<html>
<body>
<div class="books">
  <li><a class="title" href="/book/1">Book One</a><span class="author">Author A</span></li>
  <li><a class="title" href="/book/2">Book Two</a><span class="author">Author B</span></li>
  <li><a class="title" href="/book/3">Book  Three  Spaces</a></li>
</div>
</body>
</html>"#;

    #[test]
    fn get_elements_extracts_book_list() {
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        let elements = analyzer.get_elements("class.books@li");
        assert_eq!(elements.len(), 3);
    }

    #[test]
    fn get_string_extracts_book_name() {
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        let elements = analyzer.get_elements("class.books@li");
        assert_eq!(elements.len(), 3);

        // Extract name from first element
        let first_book = &elements[0];
        let inner_analyzer = AnalyzeRule {
            content: first_book.clone(),
            base_url: analyzer.base_url().to_string(),
            variables: HashMap::new(),
        };
        let name = inner_analyzer.get_string("tag.a@text");
        assert_eq!(name, "Book One");
    }

    #[test]
    fn get_string_with_regex_cleanup() {
        // Test that regex post-processing works on extracted strings
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        // Extract names using simple CSS selector, no regex cleanup
        let names = analyzer.get_string_list("class.books@tag.a@text");
        // Third book has "Book  Three  Spaces" with extra spaces
        assert_eq!(names, vec!["Book One", "Book Two", "Book  Three  Spaces"]);
    }

    #[test]
    fn get_string_list_regex_cleanup() {
        // Test regex replacement on extracted strings
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        // The regex ##\\s+## replaces whitespace with nothing (removes it)
        let names = analyzer.get_string_list("class.books@tag.a@text##\\s+##");
        assert_eq!(names, vec!["BookOne", "BookTwo", "BookThreeSpaces"]);
    }

    #[test]
    fn css_mode_explicit_prefix() {
        let html = r#"<div class="result-list"><a href="/1">First</a></div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        let elements = analyzer.get_elements("@CSS:.result-list > a");
        assert_eq!(elements.len(), 1);
    }

    #[test]
    fn json_content_with_json_path() {
        let json = r#"{"books":[{"title":"Foo","author":"A"},{"title":"Bar","author":"B"}]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        let titles = analyzer.get_string_list("$.books[*].title");
        assert_eq!(titles, vec!["Foo", "Bar"]);
    }

    #[test]
    fn json_content_elements() {
        let json = r#"{"books":[{"title":"Foo"},{"title":"Bar"}]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        let elements = analyzer.get_elements("$.books[*]");
        assert_eq!(elements.len(), 2);
    }

    #[test]
    fn variable_storage_and_retrieval() {
        let mut analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        analyzer.set_variable("page", "1");
        analyzer.set_variable("key", "test");

        assert_eq!(analyzer.get_variable("page"), Some(&"1".to_string()));
        assert_eq!(analyzer.get_variable("key"), Some(&"test".to_string()));
        assert_eq!(analyzer.get_variable("missing"), None);
    }

    #[test]
    fn empty_rule_returns_empty() {
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        let result = analyzer.get_string("");
        assert_eq!(result, "");
    }

    #[test]
    fn chained_rules_try_first_successful() {
        let html = r#"<div class="books"><a href="/1">One</a></div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // First rule fails (no class.title), second succeeds
        let result = analyzer.get_string("class.title@text&&class.books@tag.a@text");
        assert_eq!(result, "One");
    }

    #[test]
    fn empty_content_returns_empty_elements() {
        let analyzer = AnalyzeRule::new("", "https://example.com");
        let elements = analyzer.get_elements("tag.div");
        assert!(elements.is_empty());
    }

    #[test]
    fn invalid_css_selector_returns_empty() {
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        let elements = analyzer.get_elements("nonexistent.class");
        assert!(elements.is_empty());
    }

    #[test]
    fn regex_mode_extracts() {
        let text = "Price: $100, Discount: $50";
        let analyzer = AnalyzeRule::new(text, "https://example.com");
        // Use explicit $() prefix to disambiguate from JSONPath
        let result = analyzer.get_string_list(r#"$(\d+)"#);
        assert_eq!(result, vec!["100", "50"]);
    }

    #[test]
    fn get_string_list_from_css() {
        let analyzer = AnalyzeRule::new(SEARCH_HTML, "https://example.com");
        let names = analyzer.get_string_list("class.books@tag.a@text");
        assert_eq!(names, vec!["Book One", "Book Two", "Book  Three  Spaces"]);
    }

    #[test]
    fn json_with_value_object() {
        let json = r#"{"books":{"item":{"title":"The Book"}}}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        let title = analyzer.get_string("$.books.item.title");
        assert_eq!(title, "The Book");
    }
}