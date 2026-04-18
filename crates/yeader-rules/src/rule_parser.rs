//! Parser for legado source-rule strings.

use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Default,
    Css,
    Json,
    Regex,
    Js,
    XPath,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRule {
    pub rule: String,
    pub mode: Mode,
    pub replace_regex: String,
    pub replacement: String,
    pub replace_first: bool,
    pub put_map: HashMap<String, String>,
}

pub fn split_source_rule(raw: &str) -> Vec<SourceRule> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Vec::new();
    }

    let (without_put, put_map) = extract_put_map(raw);
    let (mode, without_prefix) = detect_mode(&without_put);
    let (rule, replace_regex, replacement, replace_first) = split_regex_replacement(without_prefix);

    vec![SourceRule {
        rule,
        mode,
        replace_regex,
        replacement,
        replace_first,
        put_map,
    }]
}

fn detect_mode(raw: &str) -> (Mode, &str) {
    if let Some(rest) = raw.strip_prefix("@CSS:") {
        return (Mode::Css, rest);
    }
    if let Some(rest) = raw.strip_prefix("@Json:") {
        return (Mode::Json, rest);
    }
    if let Some(rest) = raw.strip_prefix("@js:") {
        return (Mode::Js, rest);
    }
    if raw.starts_with("<js>") && raw.contains("</js>") {
        let inner = raw.trim_start_matches("<js>");
        let inner = inner.trim_end_matches("</js>");
        return (Mode::Js, inner);
    }
    if raw.starts_with("$.") || raw.starts_with("$[") {
        return (Mode::Json, raw);
    }
    if raw.starts_with("$(") && raw.ends_with(')') {
        // Regex mode: $() wraps a regex pattern
        let inner = raw.trim_start_matches("$(").trim_end_matches(')');
        return (Mode::Regex, inner);
    }
    if raw.starts_with('/') {
        return (Mode::XPath, raw);
    }
    (Mode::Default, raw)
}

fn extract_put_map(raw: &str) -> (String, HashMap<String, String>) {
    let mut put_map = HashMap::new();
    let mut output = raw.to_string();

    while let Some(start) = output.find("@put:{") {
        let rest = &output[start + 6..];
        let Some(end_rel) = rest.find('}') else {
            break;
        };
        let inner = &rest[..end_rel];
        for pair in inner.split(',') {
            let pair = pair.trim();
            if let Some((key, value)) = pair.split_once('=') {
                let key = key.trim();
                if !key.is_empty() {
                    put_map.insert(key.to_string(), value.trim().to_string());
                }
            }
        }
        output.replace_range(start..start + 6 + end_rel + 1, "");
    }

    (output.trim().to_string(), put_map)
}

fn split_regex_replacement(raw: &str) -> (String, String, String, bool) {
    let Some(first_sep) = raw.find("##") else {
        return (raw.trim().to_string(), String::new(), String::new(), false);
    };

    let rule = raw[..first_sep].trim().to_string();
    let rest = &raw[first_sep + 2..];
    let Some(second_sep) = rest.find("##") else {
        return (rule, rest.to_string(), String::new(), false);
    };

    let replace_regex = rest[..second_sep].to_string();
    let tail = &rest[second_sep + 2..];

    if let Some(replacement) = tail.strip_suffix("###") {
        (rule, replace_regex, replacement.to_string(), true)
    } else if let Some(replacement) = tail.strip_suffix("##") {
        (rule, replace_regex, replacement.to_string(), false)
    } else {
        (rule, replace_regex, tail.to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_css_prefixed_rule() {
        let rules = split_source_rule("@CSS:div.book-list > a@text");
        assert_eq!(rules.len(), 1);
        assert!(matches!(rules[0].mode, Mode::Css));
    }

    #[test]
    fn splits_json_path_rule() {
        let rules = split_source_rule("$.store.book[0].title");
        assert_eq!(rules.len(), 1);
        assert!(matches!(rules[0].mode, Mode::Json));
    }

    #[test]
    fn splits_regex_replacement() {
        let rules = split_source_rule("class.title@text##\\s+##");
        assert_eq!(rules[0].replace_regex, "\\s+");
        assert_eq!(rules[0].replacement, "");
        assert!(!rules[0].replace_first);
    }

    #[test]
    fn splits_regex_replace_first() {
        let rules = split_source_rule("tag.a@href##pattern##rep###");
        assert!(rules[0].replace_first);
        assert_eq!(rules[0].replace_regex, "pattern");
        assert_eq!(rules[0].replacement, "rep");
    }

    #[test]
    fn extracts_put_map() {
        let rules = split_source_rule("tag.a@text@put:{page=1, key = rust}");
        assert_eq!(rules[0].put_map.get("page"), Some(&"1".to_string()));
        assert_eq!(rules[0].put_map.get("key"), Some(&"rust".to_string()));
    }
}
