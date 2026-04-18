//! JavaScript evaluation via rhai.

use std::collections::HashMap;
use rhai::{Engine, Scope};

/// Evaluate a JS expression, returning the result as a string.
///
/// `js_str` is the JavaScript expression to evaluate.
/// `result` is an optional "result" variable available to the script (often the content string).
pub fn eval_js(js_str: &str, result: Option<&str>) -> String {
    let engine = Engine::new();
    let mut scope = Scope::new();

    if let Some(res) = result {
        scope.push("result", res.to_string());
    }
    scope.push("baseUrl", String::new());

    match engine.eval_with_scope::<String>(&mut scope, js_str) {
        Ok(output) => output,
        Err(e) => {
            eprintln!("JS eval error: {e}");
            String::new()
        }
    }
}

/// Expands `{{...}}` template expressions by evaluating the inner JS.
///
/// Each `{{expr}}` is replaced with the result of `eval_js(expr, None)`.
/// Plain text outside `{{...}}` is preserved verbatim.
pub struct JsTemplateExpander {
    vars: HashMap<String, String>,
}

impl JsTemplateExpander {
    pub fn new() -> Self {
        Self {
            vars: HashMap::new(),
        }
    }

    /// Set a variable available to JS expressions.
    pub fn set_var(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.vars.insert(key.into(), value.into());
    }

    /// Expand a template string, evaluating each `{{...}}` expression.
    pub fn expand(&self, template: &str, local_vars: &[(&str, &str)]) -> String {
        static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        let regex = RE
            .get_or_init(|| regex::Regex::new(r"\{\{([^}]+)\}\}").expect("valid template regex"));

        regex
            .replace_all(template, |captures: &regex::Captures<'_>| {
                let expr = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
                eval_js_with_scope(expr, local_vars, &self.vars)
            })
            .to_string()
    }
}

impl Default for JsTemplateExpander {
    fn default() -> Self {
        Self::new()
    }
}

/// Evaluate JS with combined variable scope.
fn eval_js_with_scope(
    js_str: &str,
    local_vars: &[(&str, &str)],
    global_vars: &HashMap<String, String>,
) -> String {
    let engine = Engine::new();
    let mut scope = Scope::new();

    for (k, v) in global_vars {
        scope.push(k.clone(), v.clone());
    }

    for (k, v) in local_vars {
        scope.push(*k, (*v).to_string());
    }

    match engine.eval_with_scope::<String>(&mut scope, js_str) {
        Ok(output) => output,
        Err(e) => {
            eprintln!("JS template eval error: {e}");
            String::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eval_js_returns_string_result() {
        assert_eq!(eval_js("\"hello\" + \" world\"", None), "hello world");
    }

    #[test]
    fn eval_js_with_result_variable() {
        assert_eq!(
            eval_js("result + \" appended\"", Some("base")),
            "base appended"
        );
    }

    #[test]
    fn eval_js_returns_empty_on_error() {
        let result = eval_js("this is not valid js !!!", None);
        assert_eq!(result, "");
    }

    #[test]
    fn template_expander_replaces_expressions() {
        let mut expander = JsTemplateExpander::new();
        expander.set_var("name", "World");
        let expanded = expander.expand(r#"Hello, {{ "Dear " + name }}!"#, &[]);
        assert_eq!(expanded, "Hello, Dear World!");
    }

    #[test]
    fn template_expander_preserves_plain_text() {
        let expanded = JsTemplateExpander::new().expand("no expressions here", &[]);
        assert_eq!(expanded, "no expressions here");
    }

    #[test]
    fn template_expander_handles_multiple_expressions() {
        let expanded = JsTemplateExpander::new().expand("{{ \"A\" }} and {{ \"B\" }}", &[]);
        assert_eq!(expanded, "A and B");
    }

    #[test]
    fn template_expander_local_vars_override() {
        let mut expander = JsTemplateExpander::new();
        expander.set_var("x", "global");
        // local var x=local should override global x=global
        let expanded = expander.expand("{{ x }}", &[("x", "local")]);
        assert_eq!(expanded, "local");
    }
}
