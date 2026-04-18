//! Main dispatcher for legado-style rule execution.
//!
//! Coordinates CSS, JSONPath, and regex engines based on rule mode detection.

use std::collections::HashMap;
use std::fmt;

use serde_json::Value;

use crate::css::CssAnalyzer;
use crate::js_engine::eval_js;
use crate::json_path::{json_path_list, json_path_string_list};
use crate::regex::{apply_replace, regex_get_elements};
use crate::rule_parser::{split_source_rule, Mode, SourceRule};
use crate::xpath::XPathAnalyzer;

/// Represents an index specification extracted from a rule suffix.
/// E.g., `.0` -> Index(0), `.-1` -> Index(-1), `[0:3]` -> Slice(0, 3), etc.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexSpec {
    /// Single index: .0, .-1
    Index(isize),
    /// Range slice: [0:3] -> start..end
    Range { start: usize, end: usize },
}

impl IndexSpec {
    /// Apply this index specification to a list of strings.
    fn apply(&self, list: &[String]) -> Vec<String> {
        match self {
            IndexSpec::Index(idx) => {
                let len = list.len() as isize;
                if len == 0 {
                    return vec![];
                }
                let normalized = if *idx < 0 { len + idx } else { *idx };
                if normalized < 0 || normalized >= len {
                    return vec![];
                }
                vec![list[normalized as usize].clone()]
            }
            IndexSpec::Range { start, end } => {
                list.iter().skip(*start).take(*end - *start).cloned().collect()
            }
        }
    }
}

/// Extract index specification from a rule suffix.
/// Returns (base_rule, index_spec) if found, None otherwise.
/// Examples:
///   "title.0" -> ("title", Index(0))
///   "items.-1" -> ("items", Index(-1))
///   "list[0:3]" -> ("list", Range{start:0, end:3})
fn extract_index_from_rule(rule: &str) -> Option<(&str, IndexSpec)> {
    // Check for bracket notation [n:m] or [n]
    if let Some(start_idx) = rule.find('[') {
        let base = &rule[..start_idx];
        let rest = &rule[start_idx + 1..];

        // Check for range [start:end]
        if let Some(colon) = rest.find(':') {
            let start_str = &rest[..colon];
            let end_str = &rest[colon + 1..].trim_end_matches(']');
            if let (Ok(start), Ok(end)) = (start_str.parse::<usize>(), end_str.parse::<usize>()) {
                return Some((base, IndexSpec::Range { start, end }));
            }
        }

        // Single index [n]
        if let Some(end_bracket) = rest.find(']') {
            let index_str = &rest[..end_bracket];
            if let Ok(idx) = index_str.parse::<isize>() {
                return Some((base, IndexSpec::Index(idx)));
            }
        }
    }

    // Check for dot notation .N or .-N
    if let Some(dot_idx) = rule.rfind('.') {
        if dot_idx > 0 {
            let base = &rule[..dot_idx];
            let index_str = &rule[dot_idx + 1..];
            // Must be all digits (possibly leading -)
            if index_str.chars().all(|c| c.is_ascii_digit() || c == '-') {
                if let Ok(idx) = index_str.parse::<isize>() {
                    // Don't treat ".git" or similar as index
                    if idx.abs() < 100000 {
                        return Some((base, IndexSpec::Index(idx)));
                    }
                }
            }
        }
    }

    None
}

/// Embed an index spec into a JSONPath rule.
/// E.g., $.items with Index(0) -> $.items[0]
/// E.g., $.items with Range{1,3} -> $.items[1:3]
fn embed_index_in_jsonpath(base_rule: &str, index_spec: &IndexSpec) -> String {
    match index_spec {
        IndexSpec::Index(idx) => {
            if *idx >= 0 {
                format!("{}[{}]", base_rule, idx)
            } else {
                // Negative index: JSONPath doesn't support -1 directly,
                // but we can try. Some implementations may not support it.
                format!("{}[{}]", base_rule, idx)
            }
        }
        IndexSpec::Range { start, end } => {
            format!("{}[{}:{}]", base_rule, start, end)
        }
    }
}

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

    /// Create a new analyzer with existing Content.
    pub fn from_content(content: Content, base_url: &str) -> Self {
        Self {
            content,
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
    /// Within a segment, `||` acts as short-circuit: if first part returns empty, try second.
    pub fn get_string(&self, rule: &str) -> String {
        // Handle || short-circuit within segment
        if let Some((first, second)) = rule.split_once("||") {
            let first_result = self.get_string(first.trim());
            if !first_result.is_empty() {
                return first_result;
            }
            return self.get_string(second.trim());
        }

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
    /// Supports index selectors: `.0` returns first element, `.-1` returns last,
    /// `[n:m]` returns range.
    pub fn get_string_list(&self, rule: &str) -> Vec<String> {
        // Handle index selectors first (e.g., "items.0", "list[0:3]")
        if let Some((base_rule, index_spec)) = extract_index_from_rule(rule) {
            // For JSONPath with single index (not range), embed into path
            // e.g., $.items.0 -> $.items[0], $.items.-1 -> $.items[-1]
            if (base_rule.starts_with("$.") || base_rule.starts_with("$["))
                && !matches!(index_spec, IndexSpec::Range { .. })
            {
                let indexed_rule = embed_index_in_jsonpath(base_rule, &index_spec);
                // Call try_get_string_list directly to avoid infinite recursion
                if let Some(result) = self.try_get_string_list(&indexed_rule) {
                    return result;
                }
                return Vec::new();
            }
            // For non-JSONPath or range selectors, apply after getting base result
            let all = self.get_string_list(base_rule);
            return index_spec.apply(&all);
        }

        // Handle || short-circuit within segment
        if let Some((first, second)) = rule.split_once("||") {
            let first_result = self.get_string_list(first.trim());
            if !first_result.is_empty() {
                return first_result;
            }
            return self.get_string_list(second.trim());
        }

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
    /// Supports `||` short-circuit within a segment.
    pub fn get_elements(&self, rule: &str) -> Vec<Content> {
        // Handle || short-circuit within segment
        if let Some((first, second)) = rule.split_once("||") {
            let first_result = self.get_elements(first.trim());
            if !first_result.is_empty() {
                return first_result;
            }
            return self.get_elements(second.trim());
        }

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
                } else if self.content.is_json() {
                    // LinkedTreeMap-style key access: if rule is a simple key, access directly
                    self.try_json_direct_key_access(&source_rule.rule)
                } else {
                    None
                }
            }
            Mode::Json => {
                if self.content.is_json() {
                    // LinkedTreeMap-style key access first
                    if let Some(result) = self.try_json_direct_key_access(&source_rule.rule) {
                        return Some(result);
                    }
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
            Mode::Js => {
                let content_str = self.content.to_string();
                let eval_result = eval_js(&source_rule.rule, Some(&content_str));
                if eval_result.is_empty() {
                    None
                } else {
                    Some(vec![eval_result])
                }
            }
            Mode::XPath => {
                if self.content.is_html() {
                    Some(XPathAnalyzer::new(self.content.as_str()).get_string_list(&source_rule.rule))
                } else {
                    None
                }
            }
        }
    }

    /// Try to access a JSON value directly by key (LinkedTreeMap-style).
    /// Returns Some(vec![value]) if content is a JSON object and key exists,
    /// otherwise None.
    fn try_json_direct_key_access(&self, key: &str) -> Option<Vec<String>> {
        // Only works for simple keys (no ., [, $)
        if key.contains('.') || key.contains('[') || key.contains('$') {
            return None;
        }

        let json_val = self.content.as_json_value()?;
        if let Value::Object(map) = json_val {
            if let Some(value) = map.get(key) {
                // Return the value as a string
                let s = match value {
                    Value::String(s) => s.clone(),
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => b.to_string(),
                    Value::Null => String::new(),
                    other => other.to_string(),
                };
                return Some(vec![s]);
            }
        }
        None
    }

    /// Try to access a JSON value directly by key, returning Content::Json.
    fn try_json_direct_key_access_elements(&self, key: &str) -> Option<Vec<Content>> {
        // Only works for simple keys (no ., [, $)
        if key.contains('.') || key.contains('[') || key.contains('$') {
            return None;
        }

        let json_val = self.content.as_json_value()?;
        if let Value::Object(map) = json_val {
            if let Some(value) = map.get(key) {
                return Some(vec![Content::Json(value.clone())]);
            }
        }
        None
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
                } else if self.content.is_json() {
                    // LinkedTreeMap-style key access for JSON in Default mode
                    self.try_json_direct_key_access_elements(&source_rule.rule)
                } else {
                    None
                }
            }
            Mode::Json => {
                if self.content.is_json() {
                    // Try direct key access first (LinkedTreeMap-style)
                    if let Some(elements) = self.try_json_direct_key_access_elements(&source_rule.rule) {
                        return Some(elements);
                    }
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
            Mode::Js => {
                let content_str = self.content.to_string();
                let eval_result = eval_js(&source_rule.rule, Some(&content_str));
                if eval_result.is_empty() {
                    None
                } else {
                    Some(vec![Content::Html(eval_result)])
                }
            }
            Mode::XPath => {
                if self.content.is_html() {
                    let elements = XPathAnalyzer::new(self.content.as_str()).get_elements(&source_rule.rule);
                    if elements.is_empty() {
                        None
                    } else {
                        Some(elements.into_iter().map(Content::Html).collect())
                    }
                } else {
                    None
                }
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

    // === Tests for LinkedTreeMap-style key access for JSON ===

    #[test]
    fn json_direct_key_access_get_string() {
        let json = r#"{"title":"Direct Key","author":"Someone"}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // Rule is just a key name, not a path - should access directly
        assert_eq!(analyzer.get_string("title"), "Direct Key");
        assert_eq!(analyzer.get_string("author"), "Someone");
    }

    #[test]
    fn json_direct_key_access_get_string_missing_key() {
        let json = r#"{"title":"Present"}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // Missing key should return empty
        assert_eq!(analyzer.get_string("missing"), "");
    }

    #[test]
    fn json_direct_key_access_with_json_path_still_works() {
        let json = r#"{"data":{"title":"Nested"}}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // JSONPath should still work when rule contains path chars
        assert_eq!(analyzer.get_string("$.data.title"), "Nested");
    }

    #[test]
    fn json_direct_key_access_elements() {
        let json = r#"{"book":{"title":"The Book","pages":350}}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        let elements = analyzer.get_elements("book");
        assert_eq!(elements.len(), 1);
        match &elements[0] {
            Content::Json(v) => {
                assert_eq!(v["title"].as_str(), Some("The Book"));
                assert_eq!(v["pages"].as_i64(), Some(350));
            }
            _ => panic!("Expected Json content"),
        }
    }

    #[test]
    fn json_direct_key_access_numbers_and_bools() {
        let json = r#"{"count":42,"active":true,"rate":3.14}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        assert_eq!(analyzer.get_string("count"), "42");
        assert_eq!(analyzer.get_string("active"), "true");
        assert_eq!(analyzer.get_string("rate"), "3.14");
    }

    // === Tests for Index selector for string list ===

    #[test]
    fn index_selector_first_element() {
        let json = r#"{"items":["first","second","third"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // .0 should return first element as single-element vec
        let result = analyzer.get_string_list("$.items.0");
        assert_eq!(result, vec!["first"]);
    }

    #[test]
    fn index_selector_last_element() {
        let json = r#"{"items":["first","second","third"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // .-1 should return last element
        let result = analyzer.get_string_list("$.items.-1");
        assert_eq!(result, vec!["third"]);
    }

    #[test]
    fn index_selector_second_last_element() {
        let json = r#"{"items":["first","second","third"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // .-2 should return second-to-last element
        let result = analyzer.get_string_list("$.items.-2");
        assert_eq!(result, vec!["second"]);
    }

    #[test]
    fn index_selector_out_of_bounds() {
        let json = r#"{"items":["first","second"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // Index out of bounds should return empty
        let result = analyzer.get_string_list("$.items.10");
        assert_eq!(result, Vec::<String>::new());
    }

    #[test]
    fn index_selector_negative_out_of_bounds() {
        let json = r#"{"items":["first"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // -5 on a 1-element list should return empty
        let result = analyzer.get_string_list("$.items.-5");
        assert_eq!(result, Vec::<String>::new());
    }

    #[test]
    fn index_selector_bracket_notation() {
        let json = r#"{"items":["a","b","c","d"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // [1] should return second element
        let result = analyzer.get_string_list("$.items[1]");
        assert_eq!(result, vec!["b"]);
    }

    #[test]
    fn index_selector_on_css_result() {
        let html = r#"<div class="items"><span>One</span><span>Two</span><span>Three</span></div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // Get all spans then pick first
        let result = analyzer.get_string_list("class.items@tag.span@text.0");
        assert_eq!(result, vec!["One"]);
    }

    // === Tests for || short-circuit logic ===

    #[test]
    fn or_short_circuit_returns_first_if_non_empty() {
        let html = r#"<div class="title">Found Title</div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // First part succeeds, should return it (not try second)
        let result = analyzer.get_string("class.title@text||class.other@text");
        assert_eq!(result, "Found Title");
    }

    #[test]
    fn or_short_circuit_falls_back_to_second() {
        let html = r#"<div class="other">Fallback</div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // First part fails (no class.title), should try second
        let result = analyzer.get_string("class.title@text||class.other@text");
        assert_eq!(result, "Fallback");
    }

    #[test]
    fn or_short_circuit_get_string_list() {
        let json = r#"{"results":[],"fallback":["secondary"]}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // First part $.missing returns empty, so short-circuit to $.fallback
        // $.fallback returns the array as a JSON string "[\"secondary\"]"
        let result = analyzer.get_string_list("$.missing||$.fallback");
        assert_eq!(result, vec![r#"["secondary"]"#]);
    }

    #[test]
    fn or_short_circuit_get_elements() {
        let json = r#"{"data":null}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // First fails, second also fails
        let result = analyzer.get_elements("$.data.title||$.nonexistent");
        assert!(result.is_empty());
    }

    #[test]
    fn or_short_circuit_elements_returns_first_if_non_empty() {
        let json = r#"{"book":{"title":"Valid"}}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // First succeeds
        let result = analyzer.get_elements("book||$.other");
        assert_eq!(result.len(), 1);
    }

    // === Tests for JSON object field access in Default mode ===

    #[test]
    fn json_default_mode_auto_switches_to_json_for_simple_key() {
        let json = r#"{"title":"Auto Json Mode","count":5}"#;
        let analyzer = AnalyzeRule::new_json(json, "https://example.com");
        // Without explicit @Json: prefix, simple key should auto-access JSON
        let elements = analyzer.get_elements("title");
        assert_eq!(elements.len(), 1);
        match &elements[0] {
            Content::Json(Value::String(s)) => assert_eq!(s, "Auto Json Mode"),
            _ => panic!("Expected Json String content"),
        }
    }

    #[test]
    fn json_default_mode_still_uses_css_for_html_content() {
        let html = r#"<div class="test">CSS works</div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // For HTML content, should still use CSS
        let elements = analyzer.get_elements("class.test");
        assert_eq!(elements.len(), 1);
        match &elements[0] {
            Content::Html(_) => {}
            _ => panic!("Expected Html content"),
        }
    }

    #[test]
    fn json_default_mode_complex_rule_uses_css() {
        let html = r#"<div class="test"><a href="/link">Text</a></div>"#;
        let analyzer = AnalyzeRule::new(html, "https://example.com");
        // CSS-style rule should still use CSS even in JSON content
        // (rule contains . and @ so not a simple key)
        let elements = analyzer.get_elements("class.test@tag.a");
        assert_eq!(elements.len(), 1);
    }
}