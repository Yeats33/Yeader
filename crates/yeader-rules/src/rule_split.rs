//! Legacy-compatible rule splitting helpers.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitRuleResult {
    pub parts: Vec<String>,
    pub delimiter: Option<String>,
}

pub fn split_rule(input: &str, delimiters: &[&str]) -> SplitRuleResult {
    let Some((delimiter, first_pos)) = first_top_level_delimiter(input, delimiters) else {
        return SplitRuleResult {
            parts: vec![input.to_string()],
            delimiter: None,
        };
    };

    let mut parts = Vec::new();
    let mut start = 0;
    let mut index = 0;
    let delimiter_len = delimiter.len();

    while index < input.len() {
        let Some(ch) = input[index..].chars().next() else {
            break;
        };

        if index >= first_pos
            && is_top_level_position(input, index)
            && input[index..].starts_with(delimiter)
        {
            parts.push(input[start..index].to_string());
            index += delimiter_len;
            start = index;
            continue;
        }

        index += ch.len_utf8();
    }

    parts.push(input[start..].to_string());

    SplitRuleResult {
        parts,
        delimiter: Some(delimiter.to_string()),
    }
}

pub fn last_top_level_char(input: &str, target: char) -> Option<usize> {
    let mut result = None;
    let mut state = ScanState::default();

    for (index, ch) in input.char_indices() {
        state.advance(ch);
        if state.is_top_level() && ch == target {
            result = Some(index);
        }
    }

    result
}

pub fn trim_rule_start(input: &str) -> &str {
    input.trim_start_matches(|ch: char| ch == '@' || ch.is_whitespace())
}

fn first_top_level_delimiter<'a>(
    input: &'a str,
    delimiters: &[&'a str],
) -> Option<(&'a str, usize)> {
    let mut state = ScanState::default();

    for (index, ch) in input.char_indices() {
        state.advance(ch);
        if !state.is_top_level() {
            continue;
        }

        for delimiter in delimiters {
            if input[index..].starts_with(delimiter) {
                return Some((*delimiter, index));
            }
        }
    }

    None
}

fn is_top_level_position(input: &str, target_index: usize) -> bool {
    let mut state = ScanState::default();

    for (index, ch) in input.char_indices() {
        if index == target_index {
            return state.is_top_level();
        }
        state.advance(ch);
    }

    state.is_top_level()
}

#[derive(Debug, Default, Clone, Copy)]
struct ScanState {
    bracket_depth: usize,
    paren_depth: usize,
    brace_depth: usize,
    in_single_quote: bool,
    in_double_quote: bool,
    escaped: bool,
}

impl ScanState {
    fn advance(&mut self, ch: char) {
        if self.escaped {
            self.escaped = false;
            return;
        }

        if ch == '\\' {
            self.escaped = true;
            return;
        }

        if self.in_single_quote {
            if ch == '\'' {
                self.in_single_quote = false;
            }
            return;
        }

        if self.in_double_quote {
            if ch == '"' {
                self.in_double_quote = false;
            }
            return;
        }

        match ch {
            '\'' => self.in_single_quote = true,
            '"' => self.in_double_quote = true,
            '[' => self.bracket_depth += 1,
            ']' => self.bracket_depth = self.bracket_depth.saturating_sub(1),
            '(' => self.paren_depth += 1,
            ')' => self.paren_depth = self.paren_depth.saturating_sub(1),
            '{' => self.brace_depth += 1,
            '}' => self.brace_depth = self.brace_depth.saturating_sub(1),
            _ => {}
        }
    }

    fn is_top_level(&self) -> bool {
        !self.in_single_quote
            && !self.in_double_quote
            && self.bracket_depth == 0
            && self.paren_depth == 0
            && self.brace_depth == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_by_first_top_level_delimiter() {
        let split = split_rule("a&&b&&c", &["&&", "||"]);
        assert_eq!(split.delimiter.as_deref(), Some("&&"));
        assert_eq!(split.parts, vec!["a", "b", "c"]);
    }

    #[test]
    fn ignores_delimiters_inside_brackets() {
        let split = split_rule("$.items[?(@.a&&@.b)]||$.fallback", &["&&", "||"]);
        assert_eq!(split.delimiter.as_deref(), Some("||"));
        assert_eq!(split.parts, vec!["$.items[?(@.a&&@.b)]", "$.fallback"]);
    }

    #[test]
    fn finds_last_top_level_char() {
        let rule = r#"div[data-x='a@b'] a@text"#;
        assert_eq!(last_top_level_char(rule, '@'), Some(19));
    }
}
