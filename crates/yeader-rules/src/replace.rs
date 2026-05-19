//! Replace rule execution for content transformation.
//!
//! Applies a list of replace rules in order, skipping disabled rules
//! and using regex-based replacement with optional first-match-only mode.

use crate::regex::apply_replace;

/// A replace rule for content transformation.
#[derive(Debug, Clone, PartialEq)]
pub struct ReplaceRule {
    /// Regex pattern to match
    pub pattern: String,
    /// Replacement string (supports capture groups like `$1`)
    pub replacement: String,
    /// Whether this rule is enabled
    pub enabled: bool,
    /// If true, only replace the first match; if false, replace all
    pub replace_first: bool,
}

impl ReplaceRule {
    /// Create a new replace rule.
    pub fn new(pattern: String, replacement: String, enabled: bool, replace_first: bool) -> Self {
        Self {
            pattern,
            replacement,
            enabled,
            replace_first,
        }
    }
}

/// Apply a list of replace rules to the input text in order.
///
/// Rules are applied sequentially, with each rule's output becoming the input
/// for the next rule. Disabled rules are skipped.
///
/// # Examples
///
/// ```
/// use yeader_rules::replace::{apply_replace_rules, ReplaceRule};
///
/// let rules = vec![
///     ReplaceRule::new("广告".to_string(), "".to_string(), true, false),
///     ReplaceRule::new("\\s{2,}".to_string(), " ".to_string(), true, false),
/// ];
/// let result = apply_replace_rules("这是 广告  文本", &rules);
/// assert_eq!(result, "这是 文本");
/// ```
pub fn apply_replace_rules(text: &str, rules: &[ReplaceRule]) -> String {
    let mut result = text.to_string();

    for rule in rules {
        if !rule.enabled {
            continue;
        }
        result = apply_replace(
            &result,
            &rule.pattern,
            &rule.replacement,
            rule.replace_first,
        );
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to create a ReplaceRule for testing.
    fn make_rule(id: i64, pattern: &str, replacement: &str, enabled: bool) -> ReplaceRule {
        let _ = id; // unused in execution, only for test clarity
        ReplaceRule::new(pattern.to_string(), replacement.to_string(), enabled, false)
    }

    #[test]
    fn applies_enabled_rules_in_order() {
        let rules = vec![
            make_rule(1, "广告", "", true),
            make_rule(2, "\\s{2,}", " ", true),
            make_rule(3, "disabled", "nope", false), // disabled, skip
        ];
        let result = apply_replace_rules("这是 广告  文本", &rules);
        assert_eq!(result, "这是 文本");
    }

    #[test]
    fn skips_disabled_rules() {
        let rules = vec![
            make_rule(1, "广告", "X", true),
            make_rule(2, "should_be_skipped", "Y", false), // disabled
            make_rule(3, "广告", "Z", true),
        ];
        let result = apply_replace_rules("广告内容", &rules);
        // Only first and third rules apply (both replace "广告" with "X" then "Z")
        // Actually: rule1 transforms "广告" -> "X", rule2 skipped, rule3 can't match "广告" in "X内容"
        assert_eq!(result, "X内容");
    }

    #[test]
    fn empty_rules_returns_original() {
        let rules: Vec<ReplaceRule> = vec![];
        let result = apply_replace_rules("原始文本", &rules);
        assert_eq!(result, "原始文本");
    }

    #[test]
    fn replace_first_only_replaces_first() {
        let rules = vec![ReplaceRule::new(
            "a".to_string(),
            "X".to_string(),
            true,
            true, // replace_first = true
        )];
        let result = apply_replace_rules("aaa", &rules);
        assert_eq!(result, "Xaa");
    }

    #[test]
    fn replace_all_replaces_all() {
        let rules = vec![ReplaceRule::new(
            "a".to_string(),
            "X".to_string(),
            true,
            false, // replace_all
        )];
        let result = apply_replace_rules("aaa", &rules);
        assert_eq!(result, "XXX");
    }

    #[test]
    fn rules_chain_in_sequence() {
        // Rule 1: "1" -> "2"
        // Rule 2: "2" -> "3"
        // Result: "1" -> "2" -> "3"
        let rules = vec![
            ReplaceRule::new("1".to_string(), "2".to_string(), true, false),
            ReplaceRule::new("2".to_string(), "3".to_string(), true, false),
        ];
        let result = apply_replace_rules("1", &rules);
        assert_eq!(result, "3");
    }

    #[test]
    fn capture_groups_work() {
        let rules = vec![ReplaceRule::new(
            "(\\w+)@(\\w+)".to_string(),
            "$2.$1".to_string(),
            true,
            false,
        )];
        let result = apply_replace_rules("john@doe", &rules);
        assert_eq!(result, "doe.john");
    }

    #[test]
    fn invalid_regex_skipped_gracefully() {
        let rules = vec![
            ReplaceRule::new("valid".to_string(), "V".to_string(), true, false),
            ReplaceRule::new("[invalid".to_string(), "I".to_string(), true, false),
            ReplaceRule::new("valid".to_string(), "VV".to_string(), true, false),
        ];
        // Invalid regex returns original text for that rule, chain continues
        // rule1: "valid" -> "V" -> "V text"
        // rule2: "[invalid" is invalid, so text unchanged -> "V text"
        // rule3: "valid" not found in "V text", so unchanged -> "V text"
        let result = apply_replace_rules("valid text", &rules);
        assert_eq!(result, "V text");
    }
}
