//! Yeader native source format.
//!
//! This module defines the canonical source contract used by the app. External
//! formats should be translated into these structures before execution.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{LegacyBookSource, LegacyRssSource};

/// Parse a Yeader source-pack JSON payload.
pub fn parse_yeader_source_pack(json: &str) -> Result<YeaderSourcePack, serde_json::Error> {
    serde_json::from_str(json)
}

/// A versioned bundle of Yeader-native sources.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderSourcePack {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub sources: Vec<YeaderSource>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// A single Yeader-native source, independent of any imported source format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderSource {
    pub id: String,
    pub name: String,
    pub media_type: YeaderMediaType,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub donate_url: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub request_defaults: YeaderRequestDefaults,
    #[serde(default)]
    pub auth: Option<YeaderAuthConfig>,
    #[serde(default)]
    pub compatibility: Option<YeaderCompatibilityProfile>,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    #[serde(default)]
    pub explore_categories: Vec<YeaderExploreCategory>,
    #[serde(default)]
    pub capabilities: Vec<YeaderCapability>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// A discoverable category/section exposed by a source's explore capability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderExploreCategory {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    #[serde(default)]
    pub order_options: Vec<YeaderExploreOrder>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// A sort/order variant available within an explore category.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderExploreOrder {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// The content family a source primarily serves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum YeaderMediaType {
    Novel,
    Rss,
    Comic,
    Audio,
    Video,
    Drama,
    Generic,
}

/// Login/session hints for sources that need user identity.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderAuthConfig {
    #[serde(default)]
    pub login_url: Option<String>,
    #[serde(default)]
    pub login_ui: Option<String>,
    #[serde(default)]
    pub login_check_script: Option<String>,
    #[serde(default)]
    pub cookie_jar: bool,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// Compatibility metadata retained during external source import.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderCompatibilityProfile {
    pub origin_format: String,
    #[serde(default)]
    pub origin_version: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub requires: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// A single executable source capability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderCapability {
    pub kind: YeaderCapabilityKind,
    #[serde(default)]
    pub request: Option<YeaderRequest>,
    #[serde(default)]
    pub item: Option<YeaderSelector>,
    #[serde(default)]
    pub fields: BTreeMap<String, YeaderSelector>,
    #[serde(default)]
    pub actions: Vec<YeaderAction>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// Capability categories the app can execute.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum YeaderCapabilityKind {
    Search,
    Detail,
    Toc,
    Content,
    Feed,
    List,
    Review,
    Asset,
}

/// HTTP or local request template used by a capability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub query: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub pagination: Option<YeaderPagination>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// Request defaults shared across capabilities.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderRequestDefaults {
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// Optional browser TLS/HTTP2 fingerprint profile (e.g. "chrome", "chrome131",
    /// "safari18", "firefox139"). When set, requests for this source are routed
    /// through the impersonating client to defeat Cloudflare-style fingerprint
    /// gates. Unset = use the default `reqwest` path.
    #[serde(default)]
    pub impersonate: Option<String>,
    #[serde(default)]
    pub cookie_jar: bool,
}

/// Pagination template for request variables.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderPagination {
    pub variable: String,
    #[serde(default = "default_first_page")]
    pub first_page: i64,
    #[serde(default = "default_step")]
    pub step: i64,
}

/// Selector/extractor description. Execution engines interpret these fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderSelector {
    pub engine: YeaderSelectorEngine,
    pub query: String,
    #[serde(default)]
    pub output: Option<String>,
    #[serde(default)]
    pub all: bool,
    #[serde(default)]
    pub fallback: Vec<YeaderSelector>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// Selector engine names supported by the source contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum YeaderSelectorEngine {
    Css,
    JsonPath,
    XPath,
    Regex,
    Text,
    JavaScript,
    LegacyLegado,
}

/// Optional pre/post action around extraction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YeaderAction {
    pub kind: YeaderActionKind,
    pub script: String,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

/// Action categories available to executors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum YeaderActionKind {
    BeforeRequest,
    BeforeExtract,
    AfterExtract,
}

impl From<&LegacyBookSource> for YeaderSource {
    fn from(source: &LegacyBookSource) -> Self {
        let mut capabilities = Vec::new();

        if let Some(search_url) = source.search_url.as_ref() {
            let mut capability = YeaderCapability::new(
                YeaderCapabilityKind::Search,
                Some(YeaderRequest::get(search_url.clone())),
            );
            if let Some(rule) = source.rule_search.as_ref() {
                capability.item = rule.book_list.as_ref().map(legacy_selector);
                insert_legacy_field(&mut capability.fields, "title", rule.name.as_ref());
                insert_legacy_field(&mut capability.fields, "author", rule.author.as_ref());
                insert_legacy_field(&mut capability.fields, "summary", rule.intro.as_ref());
                insert_legacy_field(&mut capability.fields, "category", rule.kind.as_ref());
                insert_legacy_field(
                    &mut capability.fields,
                    "latestChapter",
                    rule.last_chapter.as_ref(),
                );
                insert_legacy_field(
                    &mut capability.fields,
                    "updatedAt",
                    rule.update_time.as_ref(),
                );
                insert_legacy_field(&mut capability.fields, "url", rule.book_url.as_ref());
                insert_legacy_field(&mut capability.fields, "coverUrl", rule.cover_url.as_ref());
                insert_legacy_field(
                    &mut capability.fields,
                    "wordCount",
                    rule.word_count.as_ref(),
                );
            }
            capabilities.push(capability);
        }

        if let Some(rule) = source.rule_book_info.as_ref() {
            let mut capability = YeaderCapability::new(YeaderCapabilityKind::Detail, None);
            capability.item = rule.init.as_ref().map(legacy_selector);
            insert_legacy_field(&mut capability.fields, "title", rule.name.as_ref());
            insert_legacy_field(&mut capability.fields, "author", rule.author.as_ref());
            insert_legacy_field(&mut capability.fields, "summary", rule.intro.as_ref());
            insert_legacy_field(&mut capability.fields, "category", rule.kind.as_ref());
            insert_legacy_field(
                &mut capability.fields,
                "latestChapter",
                rule.last_chapter.as_ref(),
            );
            insert_legacy_field(
                &mut capability.fields,
                "updatedAt",
                rule.update_time.as_ref(),
            );
            insert_legacy_field(&mut capability.fields, "coverUrl", rule.cover_url.as_ref());
            insert_legacy_field(&mut capability.fields, "tocUrl", rule.toc_url.as_ref());
            insert_legacy_field(
                &mut capability.fields,
                "wordCount",
                rule.word_count.as_ref(),
            );
            capabilities.push(capability);
        }

        if let Some(rule) = source.rule_toc.as_ref() {
            let mut capability = YeaderCapability::new(YeaderCapabilityKind::Toc, None);
            capability.item = rule.chapter_list.as_ref().map(legacy_selector);
            insert_legacy_field(&mut capability.fields, "title", rule.chapter_name.as_ref());
            insert_legacy_field(&mut capability.fields, "url", rule.chapter_url.as_ref());
            insert_legacy_field(&mut capability.fields, "isVolume", rule.is_volume.as_ref());
            insert_legacy_field(&mut capability.fields, "isVip", rule.is_vip.as_ref());
            insert_legacy_field(&mut capability.fields, "isPay", rule.is_pay.as_ref());
            insert_legacy_field(
                &mut capability.fields,
                "updatedAt",
                rule.update_time.as_ref(),
            );
            insert_legacy_field(
                &mut capability.fields,
                "nextPageUrl",
                rule.next_toc_url.as_ref(),
            );
            if let Some(script) = rule.format_js.as_ref() {
                capability
                    .actions
                    .push(YeaderAction::new(YeaderActionKind::AfterExtract, script));
            }
            if let Some(script) = rule.pre_update_js.as_ref() {
                capability
                    .actions
                    .push(YeaderAction::new(YeaderActionKind::BeforeExtract, script));
            }
            capabilities.push(capability);
        }

        if let Some(rule) = source.rule_content.as_ref() {
            let mut capability = YeaderCapability::new(YeaderCapabilityKind::Content, None);
            insert_legacy_field(&mut capability.fields, "body", rule.content.as_ref());
            insert_legacy_field(&mut capability.fields, "title", rule.title.as_ref());
            insert_legacy_field(
                &mut capability.fields,
                "nextPageUrl",
                rule.next_content_url.as_ref(),
            );
            if let Some(script) = rule.web_js.as_ref() {
                capability
                    .actions
                    .push(YeaderAction::new(YeaderActionKind::BeforeExtract, script));
            }
            capabilities.push(capability);
        }

        let legacy_rule_explore = legacy_extra_value(source, "ruleExplore");
        let legacy_rule_review = legacy_extra_value(source, "ruleReview");

        if source.explore_url.is_some() || legacy_rule_explore.is_some() {
            let mut capability = YeaderCapability::new(
                YeaderCapabilityKind::List,
                source
                    .explore_url
                    .as_ref()
                    .map(|url| YeaderRequest::get(url.clone())),
            );
            if let Some(rule) = legacy_rule_explore {
                capability
                    .extra
                    .insert("legacyRuleExplore".to_string(), rule);
            }
            capabilities.push(capability);
        }

        if legacy_extra_bool(source, "enabledReview") || legacy_rule_review.is_some() {
            let mut capability = YeaderCapability::new(YeaderCapabilityKind::Review, None);
            if let Some(rule) = legacy_rule_review {
                capability
                    .extra
                    .insert("legacyRuleReview".to_string(), rule);
            }
            capabilities.push(capability);
        }

        Self {
            id: source.book_source_url.clone(),
            name: source.book_source_name.clone(),
            media_type: YeaderMediaType::Novel,
            version: source.last_update_time.map(|value| value.to_string()),
            homepage: Some(source.book_source_url.clone()),
            publisher: None,
            donate_url: None,
            tags: split_tags(source.book_source_group.as_deref()),
            enabled: source.enabled,
            request_defaults: YeaderRequestDefaults {
                headers: parse_legacy_headers(source.header.as_deref()),
                encoding: None,
                timeout_ms: None,
                impersonate: None,
                cookie_jar: legacy_extra_bool(source, "enabledCookieJar"),
            },
            auth: legacy_auth_config(source),
            compatibility: Some(legacy_compatibility_profile(source)),
            variables: BTreeMap::new(),
            explore_categories: Vec::new(),
            capabilities,
            extra: legacy_source_extra(source),
        }
    }
}

impl From<&LegacyRssSource> for YeaderSource {
    fn from(source: &LegacyRssSource) -> Self {
        let mut capability = YeaderCapability::new(
            YeaderCapabilityKind::Feed,
            Some(YeaderRequest::get(source.source_url.clone())),
        );
        if let Some(rule) = source.rule_articles.as_ref() {
            capability.item = Some(legacy_selector(rule));
        }

        Self {
            id: source.source_url.clone(),
            name: source.source_name.clone(),
            media_type: YeaderMediaType::Rss,
            version: None,
            homepage: Some(source.source_url.clone()),
            publisher: None,
            donate_url: None,
            tags: Vec::new(),
            enabled: source.enabled,
            request_defaults: YeaderRequestDefaults::default(),
            auth: None,
            compatibility: Some(YeaderCompatibilityProfile {
                origin_format: "legado.rssSource".to_string(),
                origin_version: None,
                features: vec!["feed".to_string()],
                requires: Vec::new(),
                notes: Vec::new(),
                extra: source.extra.clone(),
            }),
            variables: BTreeMap::new(),
            explore_categories: Vec::new(),
            capabilities: vec![capability],
            extra: Map::new(),
        }
    }
}

impl YeaderCapability {
    fn new(kind: YeaderCapabilityKind, request: Option<YeaderRequest>) -> Self {
        Self {
            kind,
            request,
            item: None,
            fields: BTreeMap::new(),
            actions: Vec::new(),
            extra: Map::new(),
        }
    }
}

impl YeaderRequest {
    fn get(url: String) -> Self {
        Self {
            url,
            method: default_method(),
            headers: BTreeMap::new(),
            query: BTreeMap::new(),
            body: None,
            pagination: None,
            extra: Map::new(),
        }
    }
}

impl YeaderAction {
    fn new(kind: YeaderActionKind, script: &str) -> Self {
        Self {
            kind,
            script: script.to_string(),
            extra: Map::new(),
        }
    }
}

fn insert_legacy_field(
    fields: &mut BTreeMap<String, YeaderSelector>,
    name: &str,
    rule: Option<&String>,
) {
    if let Some(rule) = rule
        && !rule.trim().is_empty()
    {
        fields.insert(name.to_string(), legacy_selector(rule));
    }
}

fn legacy_selector(rule: &String) -> YeaderSelector {
    YeaderSelector {
        engine: YeaderSelectorEngine::LegacyLegado,
        query: rule.clone(),
        output: None,
        all: false,
        fallback: Vec::new(),
        extra: Map::new(),
    }
}

fn legacy_extra_bool(source: &LegacyBookSource, key: &str) -> bool {
    source
        .extra
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn legacy_extra_string(source: &LegacyBookSource, key: &str) -> Option<String> {
    source
        .extra
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn legacy_extra_i64(source: &LegacyBookSource, key: &str) -> Option<i64> {
    source.extra.get(key).and_then(Value::as_i64)
}

fn legacy_extra_value(source: &LegacyBookSource, key: &str) -> Option<Value> {
    source.extra.get(key).cloned()
}

fn legacy_auth_config(source: &LegacyBookSource) -> Option<YeaderAuthConfig> {
    let login_ui = legacy_extra_string(source, "loginUi");
    let cookie_jar = legacy_extra_bool(source, "enabledCookieJar");
    if source.login_url.is_none()
        && login_ui.is_none()
        && source.login_check_js.is_none()
        && !cookie_jar
    {
        return None;
    }

    Some(YeaderAuthConfig {
        login_url: source.login_url.clone(),
        login_ui,
        login_check_script: source.login_check_js.clone(),
        cookie_jar,
        extra: Map::new(),
    })
}

fn legacy_compatibility_profile(source: &LegacyBookSource) -> YeaderCompatibilityProfile {
    let mut features = Vec::new();
    let mut requires = Vec::new();
    let mut notes = Vec::new();

    if source.search_url.is_some() || source.rule_search.is_some() {
        features.push("search".to_string());
    }
    if source.rule_book_info.is_some() {
        features.push("detail".to_string());
    }
    if source.rule_toc.is_some() {
        features.push("toc".to_string());
    }
    if source.rule_content.is_some() {
        features.push("content".to_string());
    }
    if source.enabled_explore.unwrap_or(false)
        || source.explore_url.is_some()
        || source.extra.contains_key("ruleExplore")
    {
        features.push("explore".to_string());
    }
    if legacy_extra_bool(source, "enabledReview") || source.extra.contains_key("ruleReview") {
        features.push("review".to_string());
    }
    if source.extra.contains_key("jsLib")
        || source
            .search_url
            .as_deref()
            .is_some_and(|value| value.contains("<js>"))
        || source
            .explore_url
            .as_deref()
            .is_some_and(|value| value.contains("<js>"))
    {
        requires.push("javaScript".to_string());
    }
    if source.login_url.is_some()
        || source.extra.contains_key("loginUi")
        || source.login_check_js.is_some()
    {
        requires.push("login".to_string());
    }
    if legacy_extra_bool(source, "enabledCookieJar") {
        requires.push("cookieJar".to_string());
    }
    if legacy_extra_bool(source, "eventListener") {
        requires.push("eventListener".to_string());
    }
    if legacy_extra_bool(source, "customButton") {
        notes.push("usesCustomButton".to_string());
    }

    YeaderCompatibilityProfile {
        origin_format: "legado.bookSource".to_string(),
        origin_version: source.book_source_type.map(|value| value.to_string()),
        features,
        requires,
        notes,
        extra: Map::new(),
    }
}

fn legacy_source_extra(source: &LegacyBookSource) -> Map<String, Value> {
    let mut extra = source.extra.clone();
    if let Some(value) = source.book_url_pattern.as_ref() {
        extra.insert(
            "legacyBookUrlPattern".to_string(),
            Value::String(value.clone()),
        );
    }
    if let Some(value) = source.book_source_comment.as_ref() {
        extra.insert("comment".to_string(), Value::String(value.clone()));
    }
    if let Some(value) = legacy_extra_i64(source, "respondTime") {
        extra.insert("legacyRespondTime".to_string(), Value::from(value));
    }
    if let Some(value) = source.custom_order {
        extra.insert("legacyCustomOrder".to_string(), Value::from(value));
    }
    if let Some(value) = source.weight {
        extra.insert("legacyWeight".to_string(), Value::from(value));
    }
    if let Some(value) = legacy_extra_string(source, "jsLib") {
        extra.insert("legacyJsLib".to_string(), Value::String(value.clone()));
    }
    extra
}

fn split_tags(raw: Option<&str>) -> Vec<String> {
    raw.unwrap_or_default()
        .split([',', '，'])
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_legacy_headers(raw: Option<&str>) -> BTreeMap<String, String> {
    let Some(raw) = raw else {
        return BTreeMap::new();
    };

    serde_json::from_str::<BTreeMap<String, String>>(raw).unwrap_or_default()
}

const fn default_true() -> bool {
    true
}

fn default_method() -> String {
    "GET".to_string()
}

const fn default_first_page() -> i64 {
    1
}

const fn default_step() -> i64 {
    1
}

#[cfg(test)]
mod tests {
    use super::{
        YeaderCapabilityKind, YeaderMediaType, YeaderSelectorEngine, YeaderSource,
        parse_yeader_source_pack,
    };
    use crate::{parse_book_sources, parse_rss_sources};

    const BOOK_SOURCE_FIXTURE: &str =
        include_str!("../../../fixtures/legado/sources/sample-book-source.json");
    const RSS_SOURCE_FIXTURE: &str =
        include_str!("../../../fixtures/legado/rss/sample-rss-source.json");

    #[test]
    fn parses_native_source_pack() {
        let json = r#"
        {
          "format": "yeader.source-pack",
          "version": 1,
          "sources": [
            {
              "id": "example-novel",
              "name": "Example Novel",
              "mediaType": "novel",
              "publisher": "Alice",
              "donateUrl": "https://example.com/donate",
              "tags": ["demo"],
              "capabilities": [
                {
                  "kind": "search",
                  "request": {
                    "url": "https://example.com/search?q={{query}}"
                  },
                  "item": {
                    "engine": "css",
                    "query": ".result"
                  },
                  "fields": {
                    "title": {
                      "engine": "css",
                      "query": ".title",
                      "output": "text"
                    }
                  }
                }
              ]
            }
          ]
        }
        "#;

        let pack = parse_yeader_source_pack(json).expect("source pack parses");
        let source = pack.sources.first().expect("source exists");

        assert_eq!(pack.format, "yeader.source-pack");
        assert_eq!(source.media_type, YeaderMediaType::Novel);
        assert_eq!(source.publisher.as_deref(), Some("Alice"));
        assert_eq!(
            source.donate_url.as_deref(),
            Some("https://example.com/donate")
        );
        assert_eq!(source.capabilities[0].kind, YeaderCapabilityKind::Search);
        assert_eq!(
            source.capabilities[0].fields["title"].engine,
            YeaderSelectorEngine::Css
        );
    }

    #[test]
    fn translates_legacy_book_source_to_native_source() {
        let legacy_sources = parse_book_sources(BOOK_SOURCE_FIXTURE).expect("fixture parses");
        let native = YeaderSource::from(&legacy_sources[0]);

        assert_eq!(native.id, "https://example.com/source");
        assert_eq!(native.media_type, YeaderMediaType::Novel);
        assert_eq!(native.tags, vec!["Testing"]);
        assert_eq!(native.capabilities[0].kind, YeaderCapabilityKind::Search);
        assert_eq!(
            native.capabilities[0].fields["title"].engine,
            YeaderSelectorEngine::LegacyLegado
        );
        assert_eq!(native.capabilities[0].fields["title"].query, "tag.a@text");
        assert_eq!(native.request_defaults.cookie_jar, true);
        assert_eq!(native.auth.as_ref().map(|auth| auth.cookie_jar), Some(true));
        let compatibility = native
            .compatibility
            .as_ref()
            .expect("compatibility profile");
        assert_eq!(compatibility.origin_format, "legado.bookSource");
        assert!(compatibility.features.contains(&"explore".to_string()));
        assert!(compatibility.features.contains(&"review".to_string()));
        assert!(compatibility.requires.contains(&"cookieJar".to_string()));
        assert_eq!(
            native.extra.get("legacyRespondTime"),
            Some(&serde_json::Value::from(1234))
        );
    }

    #[test]
    fn translates_legacy_rss_source_to_native_source() {
        let legacy_sources = parse_rss_sources(RSS_SOURCE_FIXTURE).expect("fixture parses");
        let native = YeaderSource::from(&legacy_sources[0]);

        assert_eq!(native.id, "https://example.com/rss");
        assert_eq!(native.media_type, YeaderMediaType::Rss);
        assert_eq!(native.capabilities[0].kind, YeaderCapabilityKind::Feed);
        assert_eq!(
            native.capabilities[0]
                .item
                .as_ref()
                .map(|item| item.query.as_str()),
            Some("class.list@article")
        );
    }
}
