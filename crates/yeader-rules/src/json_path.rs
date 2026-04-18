//! Minimal JSONPath evaluator for legado rule execution.
//!
//! Supported path features:
//! - `$.foo.bar`
//! - `$[0]`
//! - `[*]`
//! - negative indexes like `[-1]`
//! - recursive descent like `$..title`

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Key(String),
    Index(isize),
    Wildcard,
    RecursiveKey(String),
}

pub fn json_path_string(json: &str, path: &str) -> String {
    json_path_string_list(json, path).join("\n")
}

pub fn json_path_string_list(json: &str, path: &str) -> Vec<String> {
    json_path_list(json, path)
        .into_iter()
        .map(|value| value_to_string(&value))
        .collect()
}

pub fn json_path_list(json: &str, path: &str) -> Vec<Value> {
    let Ok(root) = serde_json::from_str::<Value>(json) else {
        return Vec::new();
    };

    let Ok(tokens) = tokenize(path) else {
        return Vec::new();
    };

    let mut current = vec![&root];
    for token in tokens {
        current = apply_token(current, &token);
        if current.is_empty() {
            break;
        }
    }

    current.into_iter().cloned().collect()
}

fn tokenize(path: &str) -> Result<Vec<Token>, ()> {
    let bytes = path.as_bytes();
    let mut i = 0;
    let mut tokens = Vec::new();

    if bytes.first() == Some(&b'$') {
        i += 1;
    }

    while i < bytes.len() {
        match bytes[i] {
            b'.' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'.' {
                    i += 2;
                    let (key, next) = parse_identifier(path, i);
                    if key.is_empty() {
                        return Err(());
                    }
                    tokens.push(Token::RecursiveKey(key));
                    i = next;
                } else {
                    i += 1;
                    let (key, next) = parse_identifier(path, i);
                    if key.is_empty() {
                        return Err(());
                    }
                    tokens.push(Token::Key(key));
                    i = next;
                }
            }
            b'[' => {
                let end = path[i + 1..].find(']').ok_or(())? + i + 1;
                let inner = path[i + 1..end].trim();
                match inner {
                    "*" | "" => tokens.push(Token::Wildcard),
                    _ => {
                        let index = inner.parse::<isize>().map_err(|_| ())?;
                        tokens.push(Token::Index(index));
                    }
                }
                i = end + 1;
            }
            _ => {
                let (key, next) = parse_identifier(path, i);
                if key.is_empty() {
                    return Err(());
                }
                tokens.push(Token::Key(key));
                i = next;
            }
        }
    }

    Ok(tokens)
}

fn parse_identifier(path: &str, start: usize) -> (String, usize) {
    let mut end = start;
    let bytes = path.as_bytes();
    while end < bytes.len() && bytes[end] != b'.' && bytes[end] != b'[' {
        end += 1;
    }
    (path[start..end].to_string(), end)
}

fn apply_token<'a>(values: Vec<&'a Value>, token: &Token) -> Vec<&'a Value> {
    match token {
        Token::Key(key) => values
            .into_iter()
            .filter_map(|value| match value {
                Value::Object(map) => map.get(key),
                _ => None,
            })
            .collect(),
        Token::Index(index) => values
            .into_iter()
            .filter_map(|value| match value {
                Value::Array(items) => {
                    normalize_index(*index, items.len()).and_then(|i| items.get(i))
                }
                _ => None,
            })
            .collect(),
        Token::Wildcard => values
            .into_iter()
            .flat_map(|value| match value {
                Value::Array(items) => items.iter().collect::<Vec<_>>(),
                Value::Object(map) => map.values().collect::<Vec<_>>(),
                _ => Vec::new(),
            })
            .collect(),
        Token::RecursiveKey(key) => values
            .into_iter()
            .flat_map(|value| recursive_values(value, key))
            .collect(),
    }
}

fn recursive_values<'a>(value: &'a Value, key: &str) -> Vec<&'a Value> {
    let mut out = Vec::new();
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key) {
                out.push(found);
            }
            for child in map.values() {
                out.extend(recursive_values(child, key));
            }
        }
        Value::Array(items) => {
            for child in items {
                out.extend(recursive_values(child, key));
            }
        }
        _ => {}
    }
    out
}

fn normalize_index(index: isize, len: usize) -> Option<usize> {
    if len == 0 {
        return None;
    }

    let normalized = if index < 0 {
        len as isize + index
    } else {
        index
    };

    if normalized < 0 || normalized as usize >= len {
        None
    } else {
        Some(normalized as usize)
    }
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSON: &str =
        r#"{"store":{"book":[{"title":"Foo","author":"A"},{"title":"Bar","author":"B"}]}}"#;

    #[test]
    fn simple_dot_path() {
        let result = json_path_string(JSON, "$.store.book[0].title");
        assert_eq!(result, "Foo");
    }

    #[test]
    fn array_wildcard() {
        let results = json_path_string_list(JSON, "$.store.book[*].title");
        assert_eq!(results, vec!["Foo", "Bar"]);
    }

    #[test]
    fn list_extraction() {
        let results = json_path_list(JSON, "$.store.book[*]");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn negative_index() {
        let result = json_path_string(JSON, "$.store.book[-1].title");
        assert_eq!(result, "Bar");
    }

    #[test]
    fn recursive_descent() {
        let results = json_path_string_list(JSON, "$..title");
        assert_eq!(results, vec!["Foo", "Bar"]);
    }
}
