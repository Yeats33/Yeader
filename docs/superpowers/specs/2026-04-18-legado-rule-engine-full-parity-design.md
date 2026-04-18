# Legado Rule Engine — Full Parity Design

> **Status:** Approved 2026-04-18
> **Goal:** Strict feature-parity with legado rule engine in pure Rust

## Scope

Implement every legado rule engine feature that can run in pure Rust. Skip Android/WebView-dependent features (WebJs mode, Glide URLs, ExoPlayer, Android-specific data URI decoding).

## Architecture

```
yeader-net           yeader-rules              yeader-reader
─────────           ───────────              ─────────────
HttpClient      →   RuleEngine         →    WebBookOrchestrator
AnalyzeUrl          RuleAnalyzer            (searchBook)
CookieJar           JsEvaluator              getBookInfo
RateLimiter         BalancedGroupParser      getChapterList
                    innerRuleExpander        getContent
                                              exploreBook
```

Three crates, clear dependency flow:
- `yeader-net` — HTTP client, URL analysis, cookie/rate-limit middleware
- `yeader-rules` — Rule parsing, mode dispatch, CSS/JSONPath/Regex/XPath/JS execution
- `yeader-reader` — WebBook orchestration, pipeline orchestration

## Crate 1: yeader-net

### HttpClient

```rust
pub struct HttpClient {
    client: reqwest::Client,
    cookie_jar: CookieStore,
    rate_limiter: RateLimiter,
    proxy: Option<Proxy>,
}

impl HttpClient {
    pub fn new() -> Self;
    pub fn get(&self, url: &str) -> impl Future<Output = Result<Response>>;
    pub fn post(&self, url: &str, body: Body) -> impl Future<Output = Result<Response>>;
    pub fn head(&self, url: &str) -> impl Future<Output = Result<Response>>;
}
```

- Wraps `reqwest::Client` with cookie store, per-host rate limiting, and proxy support
- Cookie jar: in-memory `HashMap<String, Cookie>` keyed by host
- Rate limiter: per-host semaphore with configurable QPS (default 10)
- Proxy: `reqwest::Proxy` from config
- Timeouts: 15s connect, 30s read, configurable

### AnalyzeUrl

```rust
#[derive(Debug)]
pub struct AnalyzedUrl {
    pub url: String,
    pub method: Method,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub charset: Option<String>,
    pub retry: u8,
}

pub fn analyze_url(raw: &str, key: &str, page: i32, base_url: &str) -> Result<AnalyzedUrl>;
```

Steps:
1. **JS block evaluation** — extract `<js>...</js>` and `@js:...` patterns, evaluate via `eval_js_blocks()`
2. **innerRule expansion** — balanced-brace `{{...}}` expansion using manual char counting (not regex) — handles nested braces correctly
3. **Variable substitution** — replace `{{key}}` with search keyword, `<1,2,3>` with page-dependent value (1-indexed)
4. **URL options parsing** — split on first `,` followed by `{`, parse JSON for `method`, `headers`, `body`, `charset`, `retry`, `useWebView`, `webJs`, `dnsIp`
5. **Query encoding** — RFC 3986 percent-encoding via `percent-encoding` crate

Skipped (Android-only): `useWebView`, `webJs`, `GlideUrl`, `MediaItem`

## Crate 2: yeader-rules

### RuleEngine

```rust
pub struct RuleEngine {
    pub put_map: HashMap<String, String>,
}

impl RuleEngine {
    pub fn new() -> Self;
    pub fn put(&mut self, key: &str, value: &str);
    pub fn get(&self, key: &str) -> Option<&str>;
}
```

### RuleAnalyzer

```rust
pub struct RuleAnalyzer {
    rule: String,
    pos: usize,
}

impl RuleAnalyzer {
    pub fn new(rule: &str) -> Self;
    pub fn trim(&mut self) -> &str;
    pub fn consume_to(&mut self, seq: &str) -> Option<&str>;
    pub fn chomp_code_balanced(&mut self) -> Option<&str>;  // handles nested (), [], ''
    pub fn chomp_rule_balanced(&mut self) -> Option<&str>;   // handles nested {}
    pub fn inner_rule(&mut self, inner: &str) -> String;    // replaces {{inner}} with rule
    pub fn split_rule(&mut self, and: &str, or: &str, interleave: &str) -> Vec<String>;
}
```

Balanced group counting rules:
- Count `(...)`, `[...]`, `{...}` with escape handling for `\(`, `\[`, `\{`
- String awareness: ignore delimiters inside `'...'` and `"..."`
- Return the matched substring (including delimiters)

### innerRule Expansion

```rust
fn expand_inner_rule(rule: &str, eval_fn: Fn) -> String {
    // 1. Find {{ ... }} using balanced-brace counting
    // 2. For each match, extract JS expression inside braces
    // 3. Evaluate via rhai
    // 4. Replace the {{ ... }} with evaluated result
    // Handles nested {{ ... }} correctly via recursive counting
}
```

### SourceRule & Mode Detection

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Mode {
    Default,
    Css,
    Json,
    Regex,
    Js,
    XPath,
    WebJs,
}

pub struct SourceRule {
    pub prefix: String,
    pub mode: Mode,
    pub rule: String,
    pub replacement: Option<String>,
    pub is_put: bool,
    pub put_key: Option<String>,
    pub is_get: bool,
    pub get_key: Option<String>,
    pub is_exclusive: bool,
    pub is_regex_replace: bool,
    pub is_replace_first: bool,
    pub js_rule_type: bool,  // true if rule is {{ ... }}
}
```

Mode auto-detection from prefix:
- `$.` → `Mode::Json`
- `//` → `Mode::XPath`
- `@Css:` / `.` → `Mode::Css`
- `@Regex:` / `$()` → `Mode::Regex`
- `@Js:` / `@JavaScript:` → `Mode::Js`
- `@WebJs:` → `Mode::WebJs`
- `{{...}}` → `js_rule_type = true` (inner rule expansion)

### @put/@get Chain

```rust
// @put:{key=value} — extract value from result, store in put_map
// @get:{key}       — retrieve from put_map, substitute into rule chain
// Both are processed in split_source_rule():
//   rules = split_source_rule("...@put:{k=v}...##...||...@get:{k}...")
// put_map is stored on RuleEngine, shared across chain
```

### Mode Dispatch (analyzer.rs)

```rust
fn execute_single_rule(&self, rule: &SourceRule) -> Option<Vec<String>> {
    match rule.mode {
        Mode::Css   => Some(CssAnalyzer::new(&self.content).get_string_list(&rule.rule)),
        Mode::Json  => Some(json_get_string_list(&self.content, &rule.rule)),
        Mode::Regex => Some(regex_get_elements(&self.content, &rule.rule)),
        Mode::Js    => Some(vec![eval_js(&rule.rule, Some(&self.content.to_string()))]),
        Mode::XPath => {
            if self.content.is_html() {
                Some(XPathAnalyzer::new(self.content.as_html()).get_string_list(&rule.rule))
            } else { None }
        }
        Mode::WebJs => {
            warn!("WebJs requires Android WebView, skipping");
            Some(vec![])
        }
        Mode::Default => None,
    }
}
```

### JS Evaluator Bindings

```rust
pub fn eval_js(js_str: &str, result: Option<&str>) -> String {
    // Bindings available:
    //   result    — current content string
    //   baseUrl   — current page URL
    //   key       — search keyword (if set)
    //   page      — current page number (if set)
    // Skipped (Android-only or not applicable):
    //   java, cookie, cache, book, source, chapter, title, src,
    //   nextChapterUrl, rssArticle, fromBookInfo
}
```

### Rule Splitting

```rust
pub fn split_rule(rule: &str, and: &str, or: &str, interleave: &str) -> Vec<String>;

fn split_source_rule(source: &str) -> Vec<SourceRule> {
    // 1. Strip leading whitespace
    // 2. Detect prefix ($., //, @Css:, @Regex:, etc.)
    // 3. Split on ## for replacement (regex##replace, ### for replaceFirst)
    // 4. Parse @put:{key=value} and @get:{key} patterns
    // 5. Detect {{ ... }} js_rule_type
    // 6. Return Vec<SourceRule>
}
```

- `##` → `regex_replace_all` (global replace)
- `###` → `regex_replace` (replace first only)
- `$1-$9` → handled natively by `regex::replace_all`

## Crate 3: yeader-reader

### WebBookOrchestrator

```rust
pub struct WebBookOrchestrator {
    source: BookSource,
    client: HttpClient,
    rule_engine: RuleEngine,
}

impl WebBookOrchestrator {
    pub async fn search_book(&self, key: &str, page: i32) -> Result<Vec<SearchResult>>;
    pub async fn explore_book(&self, rule: &str) -> Result<Vec<SearchResult>>;
    pub async fn get_book_info(&self, url: &str) -> Result<BookInfo>;
    pub async fn get_chapter_list(&self, url: &str) -> Result<Vec<Chapter>>;
    pub async fn get_content(&self, url: &str) -> Result<String>;
}
```

### search_book flow

```
1. Build URL from source.searchUrl using analyze_url(key, page)
2. HTTP GET the URL
3. Parse response via RuleEngine with source.bookListRule
   - bookListRule.format.js 如何处理？
4. For each book entry:
   - Apply nameRule, authorRule, coverUrlRule, bookUrlRule via RuleEngine
   - Return SearchResult { name, author, cover_url, book_url }
```

### get_chapter_list flow

```
1. HTTP GET source.tocUrl via analyze_url
2. Parse via RuleEngine with source.tocRule
3. Apply chapter name/URL rules
4. Return Vec<Chapter> { title, url }
```

### get_content flow

```
1. HTTP GET chapter.url via analyze_url
2. Parse via RuleEngine with source.contentRule
3. Apply replacement rules (### for replaceFirst)
4. Return content string
```

## Key Gaps (What's Skipped)

| Feature | Reason |
|---------|--------|
| WebJs mode | Requires Android WebView runtime |
| Glide URL generation | Android image loading |
| ExoPlayer / MediaItem | Android media playback |
| Data URI → binary | Android Base64 decoding |
| java/crypto/cookie bindings | No Android runtime |
| ConcurrentRateLimiter (global) | Process-level, not needed |

## Reference Files

- `.cache/legado-luoyacheng/app/src/main/java/io/legado/app/model/analyzeRule/` — AnalyzeRule.kt, AnalyzeByJSoup.kt, AnalyzeByJSonPath.kt, AnalyzeByRegex.kt, AnalyzeByXPath.kt, RuleAnalyzer.kt, AnalyzeUrl.kt
- `.cache/legado-luoyacheng/app/src/main/java/io/legado/app/model/webBook/` — WebBook.kt, BookList.kt, BookInfo.kt, BookChapterList.kt, BookContent.kt

## Test Strategy

1. **Unit tests** — each crate has dedicated `#[cfg(test)]` modules
2. **Golden fixture tests** — JSON/HTML fixtures from `booksource/test.json` and `fixtures/legado/`
3. **Integration tests** — full search → chapter list → content pipeline against real book sources
4. **Reference comparison** — run same book source JSON through Kotlin legado and Rust yeader, diff results
