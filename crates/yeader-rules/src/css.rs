//! Minimal CSS analyzer for legado-style rules.

use scraper::{ElementRef, Html, Selector};

#[derive(Debug)]
pub struct CssAnalyzer {
    document: Html,
}

impl CssAnalyzer {
    pub fn new(html: &str) -> Self {
        Self {
            document: Html::parse_document(html),
        }
    }

    pub fn get_elements(&self, rule: &str) -> Vec<ElementRef<'_>> {
        if let Some(stripped) = rule.strip_prefix("@CSS:") {
            let selector = split_css_selector_and_extractor(stripped).0;
            return select_from_document(&self.document, selector);
        }

        let selector_parts = shorthand_selector_parts(rule);
        if selector_parts.is_empty() {
            return Vec::new();
        }

        let mut current: Vec<ElementRef<'_>> = Vec::new();
        let mut first = true;
        let mut index = None;

        for part in selector_parts {
            let (selector_text, step_index) = parse_selector_step(part);
            if first {
                current = if selector_text == "> *" {
                    Vec::new()
                } else {
                    select_from_document(&self.document, &selector_text)
                };
                first = false;
            } else {
                current = select_from_elements(current, &selector_text);
            }
            if step_index.is_some() {
                index = step_index;
            }
        }

        apply_index(current, index)
    }

    pub fn get_string_list(&self, rule: &str) -> Vec<String> {
        let extractor = extractor_for_rule(rule);
        self.get_elements(rule)
            .into_iter()
            .map(|element| extract_value(element, extractor))
            .collect()
    }

    pub fn get_string(&self, rule: &str) -> String {
        self.get_string_list(rule).join("\n")
    }
}

fn split_css_selector_and_extractor(rule: &str) -> (&str, &str) {
    match rule.rsplit_once('@') {
        Some((selector, extractor)) if is_extractor(extractor) => (selector, extractor),
        _ => (rule, "text"),
    }
}

fn shorthand_selector_parts(rule: &str) -> Vec<&str> {
    let mut parts: Vec<&str> = rule
        .split('@')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if matches!(parts.last(), Some(last) if is_extractor(last)) {
        parts.pop();
    }
    parts
}

fn parse_selector_step(part: &str) -> (String, Option<isize>) {
    if part == "children" {
        return ("> *".to_string(), None);
    }

    let mut raw = part;
    let mut index = None;

    if let Some((base, suffix)) = part.rsplit_once('.')
        && let Ok(parsed) = suffix.parse::<isize>()
    {
        raw = base;
        index = Some(parsed);
    }

    let selector = if let Some(value) = raw.strip_prefix("class.") {
        format!(".{value}")
    } else if let Some(value) = raw.strip_prefix("tag.") {
        value.to_string()
    } else if let Some(value) = raw.strip_prefix("id.") {
        format!("#{value}")
    } else {
        raw.to_string()
    };

    (selector, index)
}

fn select_from_document<'a>(document: &'a Html, selector_text: &str) -> Vec<ElementRef<'a>> {
    Selector::parse(selector_text)
        .ok()
        .map(|selector| document.select(&selector).collect())
        .unwrap_or_default()
}

fn select_from_elements<'a>(
    elements: Vec<ElementRef<'a>>,
    selector_text: &str,
) -> Vec<ElementRef<'a>> {
    if selector_text == "> *" {
        return elements
            .into_iter()
            .flat_map(|element| {
                element
                    .children()
                    .filter_map(ElementRef::wrap)
                    .collect::<Vec<_>>()
            })
            .collect();
    }

    let Ok(selector) = Selector::parse(selector_text) else {
        return Vec::new();
    };

    elements
        .into_iter()
        .flat_map(|element| element.select(&selector).collect::<Vec<_>>())
        .collect()
}

fn apply_index<'a>(elements: Vec<ElementRef<'a>>, index: Option<isize>) -> Vec<ElementRef<'a>> {
    let Some(index) = index else {
        return elements;
    };

    let len = elements.len() as isize;
    let normalized = if index < 0 { len + index } else { index };
    if normalized < 0 || normalized >= len {
        Vec::new()
    } else {
        elements
            .into_iter()
            .nth(normalized as usize)
            .into_iter()
            .collect()
    }
}

fn extractor_for_rule(rule: &str) -> &str {
    if let Some(stripped) = rule.strip_prefix("@CSS:") {
        return split_css_selector_and_extractor(stripped).1;
    }

    match rule.rsplit_once('@') {
        Some((_, extractor)) if is_extractor(extractor) => extractor,
        _ => "text",
    }
}

fn is_extractor(token: &str) -> bool {
    matches!(token, "text" | "textNodes" | "ownText" | "html" | "all")
        || matches!(token, "href" | "src" | "class" | "id" | "data-url")
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
mod tests {
    use super::*;

    const HTML: &str = r#"<div class="books"><ul>
  <li><a href="/book/1">Book One</a><span class="author">Author A</span></li>
  <li><a href="/book/2">Book Two</a><span class="author">Author B</span></li>
</ul></div>"#;

    #[test]
    fn legado_class_selector() {
        let engine = CssAnalyzer::new(HTML);
        let elements = engine.get_elements("class.books@li");
        assert_eq!(elements.len(), 2);
    }

    #[test]
    fn legado_tag_text_extraction() {
        let engine = CssAnalyzer::new(HTML);
        let texts = engine.get_string_list("tag.a@text");
        assert_eq!(texts, vec!["Book One", "Book Two"]);
    }

    #[test]
    fn legado_tag_attr_extraction() {
        let engine = CssAnalyzer::new(HTML);
        let hrefs = engine.get_string_list("tag.a@href");
        assert_eq!(hrefs, vec!["/book/1", "/book/2"]);
    }

    #[test]
    fn css_prefix_mode() {
        let engine = CssAnalyzer::new(HTML);
        let texts = engine.get_string_list("@CSS:div.books li a@text");
        assert_eq!(texts, vec!["Book One", "Book Two"]);
    }

    #[test]
    fn index_selector() {
        let engine = CssAnalyzer::new(HTML);
        let elements = engine.get_elements("tag.li.0");
        assert_eq!(elements.len(), 1);
    }
}
