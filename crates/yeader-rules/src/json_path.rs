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
    Filter {
        key: String,
        op: FilterOp,
        value: String,
        negate: bool,
    },
    Slice {
        start: Option<isize>,
        end: Option<isize>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum FilterOp {
    Eq,
    Ne,
    Gt,
    Lt,
    Gte,
    Lte,
    Contains,
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
                if inner == "*" || inner.is_empty() {
                    tokens.push(Token::Wildcard);
                } else if inner.starts_with('?') {
                    // Filter expression: [?(@.key op value)]
                    let inner = &inner[1..];
                    let (filter, negate) = if inner.starts_with("!@.") {
                        (&inner[1..], true)
                    } else {
                        (inner, false)
                    };
                    let filter = parse_filter(filter)?;
                    tokens.push(Token::Filter {
                        key: filter.key,
                        op: filter.op,
                        value: filter.value,
                        negate,
                    });
                } else if inner.contains(':') {
                    // Slice: [start:end]
                    let parts: Vec<&str> = inner.split(':').collect();
                    let start = parts.first().and_then(|s| s.parse::<isize>().ok());
                    let end = parts.get(1).and_then(|s| s.parse::<isize>().ok());
                    tokens.push(Token::Slice { start, end });
                } else {
                    let index = inner.parse::<isize>().map_err(|_| ())?;
                    tokens.push(Token::Index(index));
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
        Token::Filter {
            key,
            op,
            value,
            negate,
        } => {
            let filter_val = value.trim_matches(|c| c == '\'' || c == '"');
            let results: Vec<&'a Value> = values
                .into_iter()
                .filter(|v| filter_matches(v, key, op.clone(), filter_val))
                .collect();
            if *negate {
                results.into_iter().rev().collect()
            } else {
                results
            }
        }
        Token::Slice { start, end } => values
            .into_iter()
            .filter_map(|value| match value {
                Value::Array(items) => {
                    let len = items.len();
                    let s = start
                        .map(|v| normalize_index(v, len).unwrap_or(0))
                        .unwrap_or(0);
                    let e = end
                        .map(|v| {
                            if v < 0 {
                                (len as isize + v).max(0) as usize
                            } else {
                                v.min(len as isize) as usize
                            }
                        })
                        .unwrap_or(len);
                    Some(
                        items
                            .iter()
                            .skip(s)
                            .take(e.saturating_sub(s))
                            .collect::<Vec<_>>(),
                    )
                }
                _ => None,
            })
            .flatten()
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

struct FilterExpr {
    key: String,
    op: FilterOp,
    value: String,
}

fn parse_filter(inner: &str) -> Result<FilterExpr, ()> {
    // Format: @.key op value
    if !inner.starts_with("@.") {
        return Err(());
    }
    let rest = &inner[2..];
    // Find the operator
    let op = if rest.contains(">=") {
        FilterOp::Gte
    } else if rest.contains("<=") {
        FilterOp::Lte
    } else if rest.contains("!=") {
        FilterOp::Ne
    } else if rest.contains(">") {
        FilterOp::Gt
    } else if rest.contains("<") {
        FilterOp::Lt
    } else if rest.contains("=") {
        FilterOp::Eq
    } else {
        FilterOp::Contains
    };
    let parts: Vec<&str> = if op == FilterOp::Contains {
        rest.splitn(2, &op_str(&op)).collect()
    } else {
        let re = regex::Regex::new(r"([><=!]+)").unwrap();
        let splits: Vec<&str> = re.split(rest).collect();
        splits.iter().map(|s| *s).collect()
    };
    if parts.is_empty() {
        return Err(());
    }
    let key = parts[0].trim().to_string();
    let value = if parts.len() > 1 {
        parts[1].trim().to_string()
    } else {
        String::new()
    };
    Ok(FilterExpr { key, op, value })
}

fn op_str(op: &FilterOp) -> &'static str {
    match op {
        FilterOp::Eq => "=",
        FilterOp::Ne => "!=",
        FilterOp::Gt => ">",
        FilterOp::Lt => "<",
        FilterOp::Gte => ">=",
        FilterOp::Lte => "<=",
        FilterOp::Contains => "=~",
    }
}

fn filter_matches(value: &Value, key: &str, op: FilterOp, filter_val: &str) -> bool {
    let field_val = match value {
        Value::Object(map) => map.get(key),
        _ => None,
    };
    let Some(field) = field_val else {
        return false;
    };
    let field_str = match field {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => return false,
    };
    match op {
        FilterOp::Eq => field_str == filter_val,
        FilterOp::Ne => field_str != filter_val,
        FilterOp::Gt => field_str
            .parse::<f64>()
            .map(|f| f > filter_val.parse::<f64>().unwrap_or(0.0))
            .unwrap_or(false),
        FilterOp::Lt => field_str
            .parse::<f64>()
            .map(|f| f < filter_val.parse::<f64>().unwrap_or(0.0))
            .unwrap_or(false),
        FilterOp::Gte => field_str
            .parse::<f64>()
            .map(|f| f >= filter_val.parse::<f64>().unwrap_or(0.0))
            .unwrap_or(false),
        FilterOp::Lte => field_str
            .parse::<f64>()
            .map(|f| f <= filter_val.parse::<f64>().unwrap_or(0.0))
            .unwrap_or(false),
        FilterOp::Contains => field_str.contains(filter_val),
    }
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
