//! XPath analyzer built on top of `scraper`.
//!
//! This module provides XPath-like query capabilities by converting XPath
//! expressions to CSS selectors that the `scraper` crate can execute.

use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use crate::rule_split::{last_top_level_char, split_rule, trim_rule_start};

#[derive(Debug)]
pub struct XPathAnalyzer {
    document: Html,
}

impl XPathAnalyzer {
    pub fn new(html: &str) -> Self {
        Self {
            document: Html::parse_document(html),
        }
    }

    /// Get elements matching the XPath rule, returned as HTML strings.
    pub fn get_elements(&self, rule: &str) -> Vec<String> {
        let source_rule = SourceRule::parse(rule);
        if source_rule.elements_rule.is_empty() {
            return Vec::new();
        }

        let split = split_rule(&source_rule.elements_rule, &["&&", "||", "%%"]);
        let mut groups = Vec::new();

        for part in split.parts {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            let matched = if source_rule.is_xpath {
                select_xpath_elements(&self.document, part)
            } else {
                self.get_default_elements(part)
            };

            if matched.is_empty() {
                continue;
            }

            groups.push(matched);
            if split.delimiter.as_deref() == Some("||") {
                break;
            }
        }

        combine_groups(groups, split.delimiter.as_deref() == Some("%%"))
    }

    pub fn get_string_list(&self, rule: &str) -> Vec<String> {
        let source_rule = SourceRule::parse(rule);
        if source_rule.elements_rule.is_empty() {
            return Vec::new();
        }

        let split = split_rule(&source_rule.elements_rule, &["&&", "||", "%%"]);
        let mut groups = Vec::new();

        for part in split.parts {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            let values = if source_rule.is_xpath {
                get_xpath_string_list(&self.document, part)
            } else {
                self.get_default_string_list(part)
            };

            if values.is_empty() {
                continue;
            }

            groups.push(values);
            if split.delimiter.as_deref() == Some("||") {
                break;
            }
        }

        combine_string_groups(groups, split.delimiter.as_deref() == Some("%%"))
    }

    pub fn get_string(&self, rule: &str) -> String {
        let values = self.get_string_list(rule);
        match values.len() {
            0 => String::new(),
            1 => values[0].clone(),
            _ => values.join("\n"),
        }
    }

    fn get_default_elements(&self, rule: &str) -> Vec<String> {
        let trimmed = trim_rule_start(rule);
        if trimmed.is_empty() {
            return Vec::new();
        }

        let rules = split_rule(trimmed, &["@"]).parts;
        if rules.is_empty() {
            return Vec::new();
        }

        let selector = Selector::parse("html").ok();
        let root = selector.and_then(|s| self.document.select(&s).next());
        let Some(root) = root else {
            return Vec::new();
        };

        let mut current = vec![root];
        for segment in rules {
            let segment = segment.trim();
            if segment.is_empty() {
                continue;
            }

            let next = get_elements_single(current, segment);
            current = next;
        }

        current.into_iter().map(|e| e.html()).collect()
    }

    fn get_default_string_list(&self, rule: &str) -> Vec<String> {
        let trimmed = trim_rule_start(rule);
        if trimmed.is_empty() {
            return Vec::new();
        }

        let rules = split_rule(trimmed, &["@"]).parts;
        if rules.is_empty() {
            return Vec::new();
        }

        let selector = Selector::parse("html").ok();
        let root = selector.and_then(|s| self.document.select(&s).next());
        let Some(root) = root else {
            return Vec::new();
        };

        let mut current = vec![root];
        let last_index = rules.len().saturating_sub(1);

        for segment in rules[..last_index].iter().map(|s| s.trim()) {
            if segment.is_empty() {
                continue;
            }
            current = get_elements_single(current, segment);
        }

        if current.is_empty() {
            return Vec::new();
        }

        get_result_last(current, rules[last_index].trim())
    }
}

#[derive(Debug)]
struct SourceRule {
    is_xpath: bool,
    elements_rule: String,
}

impl SourceRule {
    fn parse(rule: &str) -> Self {
        let trimmed = rule.trim();

        // Check for explicit @XPath: prefix
        if let Some(stripped) = strip_prefix_ignore_ascii_case(trimmed, "@XPath:") {
            return Self {
                is_xpath: true,
                elements_rule: stripped.trim().to_string(),
            };
        }

        // Auto-detect XPath expressions: starting with / or //
        let is_xpath = trimmed.starts_with('/');

        Self {
            is_xpath,
            elements_rule: trimmed.to_string(),
        }
    }
}

fn strip_prefix_ignore_ascii_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    value
        .get(..prefix.len())
        .filter(|head| head.eq_ignore_ascii_case(prefix))
        .map(|_| &value[prefix.len()..])
}

/// Find elements matching an XPath-like pattern and return their HTML.
fn select_xpath_elements<'a>(document: &'a Html, xpath: &str) -> Vec<String> {
    let xpath = xpath.trim();
    if xpath.is_empty() {
        return Vec::new();
    }

    // Split off extractor suffix if present (e.g., "//a@href" -> ("//a", "@href"))
    let (path_part, extractor) = if let Some(idx) = last_top_level_char(xpath, '@') {
        let candidate = &xpath[idx + 1..];
        if is_extractor(candidate) {
            (&xpath[..idx], Some(candidate))
        } else {
            (xpath, None)
        }
    } else {
        (xpath, None)
    };

    let elements = evaluate_xpath_path(document, path_part);

    if elements.is_empty() {
        return Vec::new();
    }

    if let Some(ext) = extractor {
        extract_from_elements(elements, ext)
    } else {
        elements.into_iter().map(|e| e.html()).collect()
    }
}

/// Get string list using XPath-like pattern.
fn get_xpath_string_list<'a>(document: &'a Html, xpath: &str) -> Vec<String> {
    let xpath = xpath.trim();
    if xpath.is_empty() {
        return Vec::new();
    }

    // Split off extractor suffix if present
    let (path_part, extractor) = if let Some(idx) = last_top_level_char(xpath, '@') {
        let candidate = &xpath[idx + 1..];
        if is_extractor(candidate) {
            (&xpath[..idx], Some(candidate))
        } else {
            (xpath, None)
        }
    } else {
        // Check for text() extractor
        if xpath.ends_with("/text()") {
            let path = &xpath[..xpath.len() - 7];
            let elements = evaluate_xpath_path(document, path);
            return elements
                .iter()
                .flat_map(|e| direct_text_nodes(e))
                .map(|s| collapse_whitespace(&s))
                .collect();
        }
        // Otherwise extract text from matched elements
        let elements = evaluate_xpath_path(document, xpath);
        return elements
            .iter()
            .map(|e| collapse_whitespace(&element_text_string(e)))
            .collect();
    };

    let elements = evaluate_xpath_path(document, path_part);

    if elements.is_empty() {
        return Vec::new();
    }

    if let Some(ext) = extractor {
        extract_from_elements(elements, ext)
    } else {
        elements
            .iter()
            .map(|e| collapse_whitespace(&element_text_string(e)))
            .collect()
    }
}

/// Evaluate XPath path and return matched elements.
fn evaluate_xpath_path<'a>(document: &'a Html, xpath: &str) -> Vec<ElementRef<'a>> {
    let xpath = xpath.trim();
    if xpath.is_empty() {
        return Vec::new();
    }

    let css = match xpath_to_css(xpath) {
        Some(c) => c,
        None => return Vec::new(),
    };

    let selector = match Selector::parse(&css) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    document.select(&selector).collect()
}

/// Convert an XPath expression to a CSS selector string.
fn xpath_to_css(xpath: &str) -> Option<String> {
    let xpath = xpath.trim();

    // Normalize: remove leading // or /
    let normalized = xpath
        .strip_prefix("//")
        .or_else(|| xpath.strip_prefix('/'))?;

    // Split by / to get path segments
    let segments: Vec<&str> = normalized.split('/').filter(|s| !s.is_empty()).collect();
    if segments.is_empty() {
        return None;
    }

    let mut css_parts = Vec::new();
    for (i, seg) in segments.iter().enumerate() {
        let seg = seg.trim();
        if seg.is_empty() || seg == "*" {
            continue;
        }

        // Determine combinator
        let comb = if i == 0 { "" } else { " " };

        // Check for predicates [condition]
        let (tag, preds) = extract_predicates(seg);

        let css_seg = if tag == "*" {
            "*".to_string()
        } else {
            tag.to_string()
        };

        let full_seg = if preds.is_empty() {
            format!("{}{}", comb, css_seg)
        } else {
            let preds_css: String = preds
                .iter()
                .map(|(name, value)| format!("[{}=\"{}\"]", name, value))
                .collect();
            format!("{}{}{}", comb, css_seg, preds_css)
        };

        css_parts.push(full_seg);
    }

    if css_parts.is_empty() {
        Some("*".to_string())
    } else {
        Some(css_parts.join(""))
    }
}

type Predicate = (String, String);

fn extract_predicates(segment: &str) -> (&str, Vec<Predicate>) {
    let mut predicates = Vec::new();
    let mut last_end = 0;

    while let Some(start) = segment[last_end..].find('[') {
        let abs_start = last_end + start;
        let rest = &segment[abs_start + 1..];

        if let Some(end) = find_matching_bracket(rest) {
            let pred_content = &rest[..end];

            if let Some((name, value)) = parse_predicate(pred_content) {
                predicates.push((name, value));
            }

            last_end = abs_start + 1 + end + 1;
        } else {
            break;
        }
    }

    let tag = if last_end > 0 {
        &segment[..last_end]
    } else {
        segment
    };

    // Handle tag[position] like li[1]
    if predicates.is_empty() {
        if let Some(open_bracket) = segment.rfind('[') {
            let before = &segment[..open_bracket];
            let rest = &segment[open_bracket + 1..segment.len() - 1];
            if rest.chars().all(|c| c.is_ascii_digit()) {
                return (before, vec![]);
            }
        }
    }

    (tag, predicates)
}

fn find_matching_bracket(s: &str) -> Option<usize> {
    let mut depth = 1;
    for (i, ch) in s.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_predicate(content: &str) -> Option<(String, String)> {
    let content = content.trim();

    // @attr='value' or @attr="value"
    if let Some(rest) = content.strip_prefix('@') {
        let rest = rest.trim();
        if let Some(eq_pos) = rest.find('=') {
            let attr = rest[..eq_pos].trim().to_string();
            let val = rest[eq_pos + 1..]
                .trim()
                .trim_start_matches(|c| c == '\'' || c == '"')
                .trim_end_matches(|c| c == '\'' || c == '"')
                .to_string();
            return Some((attr, val));
        }
    }

    None
}

fn is_extractor(token: &str) -> bool {
    matches!(token, "text" | "textNodes" | "ownText" | "html" | "all")
        || matches!(
            token,
            "href" | "src" | "class" | "id" | "data-url" | "content" | "alt" | "value"
        )
        || token.starts_with('@')
}

fn extract_from_elements(elements: Vec<ElementRef<'_>>, extractor: &str) -> Vec<String> {
    if elements.is_empty() {
        return Vec::new();
    }

    let mut output = Vec::new();

    match extractor {
        "text" => {
            for elem in elements {
                let text = collapse_whitespace(&elem.text().collect::<String>());
                if !text.is_empty() {
                    output.push(text);
                }
            }
        }
        "textNodes" => {
            for elem in elements {
                let nodes = direct_text_nodes(&elem);
                if !nodes.is_empty() {
                    output.push(nodes.join("\n"));
                }
            }
        }
        "ownText" => {
            for elem in elements {
                let text = collapse_whitespace(&direct_text_nodes(&elem).join(" "));
                if !text.is_empty() {
                    output.push(text);
                }
            }
        }
        "html" => {
            for elem in elements {
                let html = sanitize_html(&elem.html());
                if !html.is_empty() {
                    output.push(html);
                }
            }
        }
        "all" => {
            for elem in elements {
                let html = elem.html();
                if !html.is_empty() {
                    output.push(html);
                }
            }
        }
        attr => {
            let attr_name = attr.trim_start_matches('@');
            for elem in elements {
                if let Some(value) = elem.value().attr(attr_name) {
                    let value = value.trim();
                    if !value.is_empty() {
                        output.push(value.to_string());
                    }
                }
            }
        }
    }

    output
}

fn get_elements_single<'a>(roots: Vec<ElementRef<'a>>, rule: &str) -> Vec<ElementRef<'a>> {
    let rule = rule.trim();
    if rule.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::new();

    for root in roots {
        for child in root.children().filter(|n| n.value().is_element()) {
            let elem = ElementRef::wrap(child).expect("valid element");
            let matches = match rule {
                "children" => true,
                s if s.starts_with("class.") => {
                    let class = s.strip_prefix("class.").unwrap().trim();
                    elem.value()
                        .attr("class")
                        .map(|c| c.split_whitespace().any(|x| x == class))
                        .unwrap_or(false)
                }
                s if s.starts_with("id.") => {
                    let id = s.strip_prefix("id.").unwrap().trim();
                    elem.value().attr("id") == Some(id)
                }
                s if s.starts_with("tag.") => {
                    let tag = s.strip_prefix("tag.").unwrap().trim().to_lowercase();
                    elem.value().name() == tag
                }
                s => elem.value().name() == s.to_lowercase(),
            };

            if matches {
                results.push(elem);
            }
        }
    }

    results
}

fn get_result_last(elements: Vec<ElementRef<'_>>, extractor: &str) -> Vec<String> {
    extract_from_elements(elements, extractor)
}

fn direct_text_nodes(elem: &ElementRef<'_>) -> Vec<String> {
    let mut results = Vec::new();
    for child in elem.children().filter(|n| n.value().is_text()) {
        if let Some(t) = child.value().as_text() {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                results.push(trimmed.to_string());
            }
        }
    }
    results
}

fn element_text_string(elem: &ElementRef<'_>) -> String {
    elem.text().collect::<String>()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn sanitize_html(html: &str) -> String {
    static SCRIPT_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static STYLE_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

    let without_script = SCRIPT_RE
        .get_or_init(|| Regex::new(r"(?is)<script\b.*?</script>").expect("valid script regex"))
        .replace_all(html, "");
    STYLE_RE
        .get_or_init(|| Regex::new(r"(?is)<style\b.*?</style>").expect("valid style regex"))
        .replace_all(&without_script, "")
        .to_string()
}

fn combine_groups<T: Clone>(groups: Vec<Vec<T>>, interleave: bool) -> Vec<T> {
    if groups.is_empty() {
        return Vec::new();
    }

    if !interleave {
        return groups.into_iter().flatten().collect();
    }

    let max_len = groups.iter().map(Vec::len).max().unwrap_or(0);
    let mut output = Vec::new();
    for index in 0..max_len {
        for group in &groups {
            if let Some(item) = group.get(index) {
                output.push(item.clone());
            }
        }
    }
    output
}

fn combine_string_groups(groups: Vec<Vec<String>>, interleave: bool) -> Vec<String> {
    if groups.is_empty() {
        return Vec::new();
    }

    if !interleave {
        return groups.into_iter().flatten().collect();
    }

    let max_len = groups.iter().map(Vec::len).max().unwrap_or(0);
    let mut output = Vec::new();
    for index in 0..max_len {
        for group in &groups {
            if let Some(item) = group.get(index) {
                output.push(item.clone());
            }
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    const HTML: &str = r#"<div class="books">
  <ul>
    <li><a href="/book/1">Book One</a><span class="author">Author A</span></li>
    <li><a href="/book/2">Book Two</a><span class="author">Author B</span></li>
    <li><a href="/book/3">Book  Three  Spaces</a><span>Tail</span></li>
  </ul>
</div>"#;

    #[test]
    fn xpath_double_slash_tag() {
        let engine = XPathAnalyzer::new(HTML);
        let elements = engine.get_elements("//li");
        assert_eq!(elements.len(), 3);
    }

    #[test]
    fn xpath_attribute_extraction() {
        let engine = XPathAnalyzer::new(HTML);
        let hrefs = engine.get_string_list("//a@href");
        assert_eq!(hrefs, vec!["/book/1", "/book/2", "/book/3"]);
    }

    #[test]
    fn xpath_text_extraction() {
        let engine = XPathAnalyzer::new(HTML);
        let texts = engine.get_string_list("//a/text()");
        assert_eq!(texts, vec!["Book One", "Book Two", "Book Three Spaces"]);
    }

    #[test]
    fn xpath_prefix_mode() {
        let engine = XPathAnalyzer::new(HTML);
        let texts = engine.get_string_list("@XPath://li/a/text()");
        assert_eq!(texts, vec!["Book One", "Book Two", "Book Three Spaces"]);
    }
}
