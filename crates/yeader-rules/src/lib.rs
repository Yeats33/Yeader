//! Rule parsing and execution services for Yeader.

pub mod analyzer;
pub mod css;
pub mod js_engine;
pub mod json_path;
pub mod pipeline;
pub mod regex;
pub mod replace;
pub mod rule_parser;
pub mod rule_split;
pub mod xpath;

use yeader_models::{SearchQuery, SearchResult};

pub use analyzer::{AnalyzeRule, Content};
pub use css::CssAnalyzer;
pub use js_engine::eval_js;
pub use json_path::{json_path_list, json_path_string, json_path_string_list};
pub use pipeline::{BookSearchResult, PipelineError, search_books};
pub use regex::{apply_replace, regex_get_elements};
pub use replace::{ReplaceRule, apply_replace_rules};
pub use rule_parser::{Mode, SourceRule, split_source_rule};

#[derive(Debug, Default)]
pub struct RuleEngine;

impl RuleEngine {
    pub fn search(&self, _query: &SearchQuery) -> Vec<SearchResult> {
        Vec::new()
    }
}
