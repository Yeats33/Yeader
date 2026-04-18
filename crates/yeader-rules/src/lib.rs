//! Rule parsing and execution services for Yeader.

pub mod css;
pub mod json_path;
pub mod regex;
pub mod rule_parser;

use yeader_models::{SearchQuery, SearchResult};

pub use css::CssAnalyzer;
pub use json_path::{json_path_list, json_path_string, json_path_string_list};
pub use regex::{apply_replace, regex_get_elements};
pub use rule_parser::{Mode, SourceRule, split_source_rule};

#[derive(Debug, Default)]
pub struct RuleEngine;

impl RuleEngine {
    pub fn search(&self, _query: &SearchQuery) -> Vec<SearchResult> {
        Vec::new()
    }
}
