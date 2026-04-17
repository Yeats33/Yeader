//! Rule parsing and execution services will live here.

use yeader_models::{SearchQuery, SearchResult};

#[derive(Debug, Default)]
pub struct RuleEngine;

impl RuleEngine {
    pub fn search(&self, _query: &SearchQuery) -> Vec<SearchResult> {
        Vec::new()
    }
}
