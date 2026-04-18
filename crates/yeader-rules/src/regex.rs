//! Regex-based content extraction and replacement.
//!
//! Supports:
//! - `apply_replace`: Replace all or first match using regex patterns
//! - `regex_get_elements`: Extract multiple matches from text using regex patterns

use regex::Regex;

/// Apply regex replacement to input text.
///
/// - `text`: The input string to transform
/// - `pattern`: The regex pattern to match
/// - `replacement`: The replacement string (supports capture groups like `$1`)
/// - `replace_first`: If true, only replace the first match; if false, replace all
///
/// # Examples
///
/// ```
/// use yeader_rules::regex::apply_replace;
///
/// // Replace all whitespace sequences with single space
/// let result = apply_replace("hello   world", "\\s+", " ", false);
/// assert_eq!(result, "hello world");
///
/// // Replace first match only (¥100 -> 100, rest preserved)
/// let result = apply_replace("价格:¥100 数量:5", "¥(\\d+)", "$1", true);
/// assert_eq!(result, "价格:100 数量:5");
/// ```
pub fn apply_replace(text: &str, pattern: &str, replacement: &str, replace_first: bool) -> String {
    let Ok(re) = Regex::new(pattern) else {
        return text.to_string();
    };

    if replace_first {
        re.replace(text, replacement).to_string()
    } else {
        re.replace_all(text, replacement).to_string()
    }
}

/// Extract all matches from text using a list of regex patterns.
///
/// Each pattern is applied in order, and all matches are collected.
/// Patterns should be capture-group-heavy to extract the desired content.
///
/// # Examples
///
/// ```
/// use yeader_rules::regex::regex_get_elements;
///
/// let text = "Chapter 1\nChapter 2\nChapter 3";
/// let results = regex_get_elements(text, &["Chapter (\\d+)"]);
/// assert_eq!(results.len(), 3);
/// ```
pub fn regex_get_elements(text: &str, patterns: &[&str]) -> Vec<String> {
    let mut results = Vec::new();

    for &pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            for cap in re.captures_iter(text) {
                // If there are captures, use the first capture group if present,
                // otherwise use the full match
                if let Some(m) = cap.get(1) {
                    results.push(m.as_str().to_string());
                } else if let Some(m) = cap.get(0) {
                    results.push(m.as_str().to_string());
                }
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_all() {
        let result = apply_replace("hello   world", "\\s+", " ", false);
        assert_eq!(result, "hello world");
    }

    #[test]
    fn replace_first_replaces_first_match_with_capture_group() {
        // replaceFirst: replace only the first match, using $1 capture group
        let result = apply_replace("价格:¥100 数量:5", "¥(\\d+)", "$1", true);
        assert_eq!(result, "价格:100 数量:5");
    }

    #[test]
    fn regex_get_elements_extracts_matches() {
        let text = "Chapter 1\nChapter 2\nChapter 3";
        let results = regex_get_elements(text, &["Chapter (\\d+)"]);
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn replace_all_with_capture_groups() {
        let result = apply_replace("<b>hello</b> <b>world</b>", "<b>(.*?)</b>", "'$1'", false);
        assert_eq!(result, "'hello' 'world'");
    }

    #[test]
    fn replace_first_only_replaces_first() {
        // replace_first: only replace the first occurrence
        let result = apply_replace("aaa bbb aaa", "aaa", "ccc", true);
        assert_eq!(result, "ccc bbb aaa");
    }

    #[test]
    fn regex_get_elements_no_captures_uses_full_match() {
        let text = "item1 item2 item3";
        let results = regex_get_elements(text, &["item\\d"]);
        assert_eq!(results, vec!["item1", "item2", "item3"]);
    }

    #[test]
    fn regex_get_elements_multiple_patterns() {
        let text = "Chapter 1 - Page 2";
        let results = regex_get_elements(text, &["Chapter (\\d+)", "Page (\\d+)"]);
        assert_eq!(results, vec!["1", "2"]);
    }

    #[test]
    fn apply_replace_invalid_regex_returns_original() {
        let result = apply_replace("hello world", "[", "$1", false);
        assert_eq!(result, "hello world");
    }

    #[test]
    fn regex_get_elements_invalid_pattern_skipped() {
        let text = "hello world";
        let results = regex_get_elements(text, &["[invalid", "world"]);
        assert_eq!(results, vec!["world"]);
    }
}
