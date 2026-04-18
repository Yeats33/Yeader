# Legado Rust 重写实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 gedoor/legado 的核心功能用 Rust 重写为跨平台阅读器 Yeader，分 4 个 Phase 从规则引擎到完整可用。

**Architecture:** 单体 Cargo workspace，7 个 library crate + 1 个 Tauri app crate。规则引擎 (`yeader-rules`) 是核心——解析上游 legado 规则 DSL，驱动 HTML/JSON 内容提取。HTTP 客户端 (`yeader-net`) 提供请求能力。`yeader-reader` 编排完整的 搜索→详情→目录→正文 管线。前端通过 Tauri IPC 消费 Rust 后端。

**Tech Stack:** Rust 2024, Tauri 2, TypeScript, Vite 6, scraper (CSS), serde_json (JSONPath-like), regex, reqwest + tokio, rusqlite, encoding_rs

---

## Phase 1: 规则引擎 + HTTP 客户端 (核心管线跑通)

### 文件结构

```
crates/yeader-rules/
├── Cargo.toml
└── src/
    ├── lib.rs              # 公开 API: RuleEngine, AnalyzeRule
    ├── analyzer.rs         # AnalyzeRule 主调度: 模式检测 → 分派到 css/json/regex
    ├── css.rs              # AnalyzeByCSS: legado CSS 简写 + @CSS: 标准选择器
    ├── json_path.rs        # AnalyzeByJsonPath: $. / $[ 路径查询
    ├── regex.rs            # AnalyzeByRegex: ##regex##replace 和正则列表提取
    ├── rule_parser.rs      # 规则文本切分: splitSourceRule, @put, {{js}}, @get
    └── replace.rs          # ReplaceRule 执行链

crates/yeader-net/
├── Cargo.toml
└── src/
    ├── lib.rs              # 公开 API: HttpClient
    ├── client.rs           # reqwest 封装: GET/POST, cookie jar, headers
    ├── url_analyzer.rs     # AnalyzeUrl: searchUrl 变量替换, URL option 解析
    └── encoding.rs         # charset 自动检测 (encoding_rs + chardetng)

crates/yeader-models/src/
    ├── rule.rs             # (新文件) SearchRule, BookInfoRule, TocRule, ContentRule 结构体
    └── lib.rs              # 补充 re-export

fixtures/legado/
    └── rules/              # (新目录) 真实书源 fixture，含完整 ruleSearch/ruleToc/ruleContent
```

---

### Task 1: 扩展 yeader-models — 补全规则结构体

**Files:**
- Create: `crates/yeader-models/src/rule.rs`
- Modify: `crates/yeader-models/src/lib.rs`
- Modify: `crates/yeader-models/src/legacy.rs`
- Create: `fixtures/legado/rules/full-book-source.json`

上游 BookSource 的规则字段当前被 `#[serde(flatten)] extra` 吞掉了。需要提升为一等字段：

- [ ] **Step 1: 创建 `rule.rs`，定义 4 组规则结构体**

对齐上游 `SearchRule` / `BookInfoRule` / `TocRule` / `ContentRule`：

```rust
// crates/yeader-models/src/rule.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub book_url: Option<String>,
    pub cover_url: Option<String>,
    pub word_count: Option<String>,
    pub check_key_word: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    pub init: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub word_count: Option<String>,
    pub can_re_name: Option<String>,
    pub download_urls: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    pub chapter_list: Option<String>,
    pub chapter_name: Option<String>,
    pub chapter_url: Option<String>,
    pub format_js: Option<String>,
    pub is_volume: Option<String>,
    pub is_vip: Option<String>,
    pub is_pay: Option<String>,
    pub update_time: Option<String>,
    pub next_toc_url: Option<String>,
    pub pre_update_js: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    pub content: Option<String>,
    pub title: Option<String>,
    pub next_content_url: Option<String>,
    pub web_js: Option<String>,
    pub source_regex: Option<String>,
    pub replace_regex: Option<String>,
    pub image_style: Option<String>,
    pub image_decode: Option<String>,
    pub pay_action: Option<String>,
}
```

- [ ] **Step 2: 在 `LegacyBookSource` 中提升规则字段**

```rust
// 在 LegacyBookSource 中新增（保持 serde(default)）
pub rule_search: Option<SearchRule>,
pub rule_book_info: Option<BookInfoRule>,
pub rule_toc: Option<TocRule>,
pub rule_content: Option<ContentRule>,
pub book_url_pattern: Option<String>,
pub login_check_js: Option<String>,
pub book_source_type: Option<i32>,   // 0=文字, 1=音频, 2=图片(漫画)
pub enabled_explore: Option<bool>,
pub explore_url: Option<String>,
```

- [ ] **Step 3: 创建包含完整规则的 fixture**

`fixtures/legado/rules/full-book-source.json` — 包含 `ruleSearch`, `ruleBookInfo`, `ruleToc`, `ruleContent` 字段，带 CSS、JSONPath、regex 样例。

- [ ] **Step 4: 写测试验证 fixture 解析**

确保 `parse_book_sources` ��正确反序列化所��规则字段且 `extra` 仅保留真正未知的字段。

- [ ] **Step 5: 跑 `cargo test --workspace`，确认无回归**

- [ ] **Step 6: 提交**

```
feat(models): add SearchRule/BookInfoRule/TocRule/ContentRule structs
```

---

### Task 2: 规则解析器 — rule_parser.rs

**Files:**
- Create: `crates/yeader-rules/src/rule_parser.rs`
- Test: inline `#[cfg(test)]`

实现上游 `AnalyzeRule.splitSourceRule` 的 Rust 等价物：

1. 检测模式前缀：`@CSS:` → CSS, `@XPath:` (暂跳过), `@Json:` → JSON, `$.` / `$[` → JSON, `/` → XPath (暂跳过)
2. 提取 `<js>...</js>` 和 `@js:` 块
3. 提取 `@put:{...}` 变量存储
4. 提取 `@get:{key}` 和 `{{expr}}` 内嵌表达式
5. 以 `##` 分割正则替换部分：`rule##regex##replacement###`（3 个 `#` = replaceFirst）

- [ ] **Step 1: 定义 `SourceRule` 和 `Mode` 枚举**

```rust
pub enum Mode { Default, Css, Json, Regex, Js, XPath }

pub struct SourceRule {
    pub rule: String,
    pub mode: Mode,
    pub replace_regex: String,
    pub replacement: String,
    pub replace_first: bool,
    pub put_map: HashMap<String, String>,
}
```

- [ ] **Step 2: 写 split_source_rule 的测试**

```rust
#[test]
fn splits_css_prefixed_rule() {
    let rules = split_source_rule("@CSS:div.book-list > a@text");
    assert_eq!(rules.len(), 1);
    assert!(matches!(rules[0].mode, Mode::Css));
}

#[test]
fn splits_json_path_rule() {
    let rules = split_source_rule("$.store.book[0].title");
    assert_eq!(rules.len(), 1);
    assert!(matches!(rules[0].mode, Mode::Json));
}

#[test]
fn splits_regex_replacement() {
    let rules = split_source_rule("class.title@text##\\s+##");
    assert_eq!(rules[0].replace_regex, "\\s+");
    assert_eq!(rules[0].replacement, "");
    assert!(!rules[0].replace_first);
}

#[test]
fn splits_regex_replace_first() {
    let rules = split_source_rule("tag.a@href##pattern##rep###");
    assert!(rules[0].replace_first);
}
```

- [ ] **Step 3: 实现 `split_source_rule`**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交**

```
feat(rules): implement rule_parser with mode detection and regex splitting
```

---

### Task 3: CSS 选择器引擎 — css.rs

**Files:**
- Create: `crates/yeader-rules/src/css.rs`
- Modify: `crates/yeader-rules/Cargo.toml` (添加 `scraper` 依赖)

实现上游 `AnalyzeByJSoup` + `ElementsSingle` 的 Rust 等价物。

legado CSS 有两条路径：
1. **`@CSS:`** 前缀 → 标准 CSS 选择器，最后一个 `@` 后是提取方式（text/html/attr）
2. **默认模式** → legado 简写：`class.xxx`, `tag.xxx`, `id.xxx`, `children`，`@` 分割多级选择，末尾 `.n` / `!n` / `[n:m]` 做索引筛选

提取方式（最后一个 `@` 后的字符串）：
- `text` → `element.text()`
- `textNodes` → 仅文本节点，`\n` 连接
- `ownText` → 不含子元素文本
- `html` → outer HTML（去 script/style）
- `all` → 原始 outer HTML
- 其他 → 作为属性名，如 `href`, `src`, `data-url`

规则组合符（`RuleAnalyzer.splitRule`）：
- `&&` → 结果 concat
- `||` → 短路，首个非空结果
- `%%` → 交叉合并

- [ ] **Step 1: 写 CSS 引擎测试（用 HTML fixture 字符串）**

```rust
const HTML: &str = r#"<div class="books"><ul>
  <li><a href="/book/1">Book One</a><span class="author">Author A</span></li>
  <li><a href="/book/2">Book Two</a><span class="author">Author B</span></li>
</ul></div>"#;

#[test]
fn legado_class_selector() {
    let engine = CssAnalyzer::new(HTML);
    let elements = engine.get_elements("class.books@li");
    assert_eq!(elements.len(), 2);
}

#[test]
fn legado_tag_text_extraction() {
    let engine = CssAnalyzer::new(HTML);
    let texts = engine.get_string_list("tag.a@text");
    assert_eq!(texts, vec!["Book One", "Book Two"]);
}

#[test]
fn legado_tag_attr_extraction() {
    let engine = CssAnalyzer::new(HTML);
    let hrefs = engine.get_string_list("tag.a@href");
    assert_eq!(hrefs, vec!["/book/1", "/book/2"]);
}

#[test]
fn css_prefix_mode() {
    let engine = CssAnalyzer::new(HTML);
    let texts = engine.get_string_list("@CSS:div.books li a@text");
    assert_eq!(texts, vec!["Book One", "Book Two"]);
}

#[test]
fn index_selector() {
    let engine = CssAnalyzer::new(HTML);
    let elements = engine.get_elements("tag.li.0");
    assert_eq!(elements.len(), 1); // 只取第 0 个
}
```

- [ ] **Step 2: 实现 `CssAnalyzer`**

- 使用 `scraper` crate 解析 HTML
- `get_elements(rule)` → 返回元素列表
- `get_string_list(rule)` → 返回提取的文本列表
- `get_string(rule)` → 返回 `\n` 连接的单字符串

- [ ] **Step 3: 实现 legado 简写到标准 CSS 的转换**

- `class.foo` → `.foo`
- `tag.div` → `div`
- `id.bar` → `#bar`
- `text.xxx` → `:contains(xxx)` (近似)
- `children` → `> *`

- [ ] **Step 4: 实现索引筛选（`ElementsSingle` 等价）**

支持：`tag.li.0`, `tag.li.-1`, `tag.li!0` (排除), `tag.li[0:3]`, `tag.li[-1:0]` (反转)

- [ ] **Step 5: 实现 `&&` / `||` / `%%` 组合**

使用上游 `RuleAnalyzer.splitRule` 逻辑。

- [ ] **Step 6: 跑测试，确认通过**

- [ ] **Step 7: 提交**

```
feat(rules): implement CSS analyzer with legado shorthand and index selectors
```

---

### Task 4: JSONPath 引擎 — json_path.rs

**Files:**
- Create: `crates/yeader-rules/src/json_path.rs`

实现上游 `AnalyzeByJSonPath` 的简化版。legado 主要用 `$.key.subkey`、`$[0].field`、`$..field` 三种 JSONPath 模式。

- [ ] **Step 1: 写 JSONPath 测试**

```rust
const JSON: &str = r#"{"store":{"book":[{"title":"Foo","author":"A"},{"title":"Bar","author":"B"}]}}"#;

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
    let results = json_path_list(JSON, "$.store.book");
    assert_eq!(results.len(), 2);
}
```

- [ ] **Step 2: 实现 JSONPath 查询**

用 `serde_json::Value` 手写路径遍历（避免外部 jsonpath crate 的兼容性问题）。支持��
- `.key` — 对象字段访问
- `[n]` — 数组索引（支持负数）
- `[*]` — 数组通配
- `..key` — 递归下降

- [ ] **Step 3: 跑测试，提交**

```
feat(rules): implement JSONPath query engine for legado rule evaluation
```

---

### Task 5: 正则引擎 — regex.rs

**Files:**
- Create: `crates/yeader-rules/src/regex.rs`

- [ ] **Step 1: 写测试**

```rust
#[test]
fn replace_all() {
    let result = apply_replace("hello   world", "\\s+", " ", false);
    assert_eq!(result, "hello world");
}

#[test]
fn replace_first_extracts_match() {
    // replaceFirst: 获取第一个匹配并在其上执行替换
    let result = apply_replace("价格:¥100 数量:5", "¥(\\d+)", "$1", true);
    assert_eq!(result, "100");
}

#[test]
fn regex_get_elements() {
    let text = "Chapter 1\nChapter 2\nChapter 3";
    let results = regex_get_elements(text, &["Chapter (\\d+)"]);
    assert_eq!(results.len(), 3);
}
```

- [ ] **Step 2: 实现 `apply_replace` 和 `regex_get_elements`**

- [ ] **Step 3: 跑测试，提交**

```
feat(rules): implement regex replace and element extraction
```

---

### Task 6: AnalyzeRule 主调度 — analyzer.rs

**Files:**
- Create: `crates/yeader-rules/src/analyzer.rs`
- Modify: `crates/yeader-rules/src/lib.rs`

将 rule_parser + css + json_path + regex 组装成完整 `AnalyzeRule`：

```rust
pub struct AnalyzeRule {
    content: Content,  // Html(String) | Json(Value)
    base_url: String,
    variables: HashMap<String, String>,
}

impl AnalyzeRule {
    pub fn new(content: &str, base_url: &str) -> Self;
    pub fn get_string(&self, rule: &str) -> String;
    pub fn get_string_list(&self, rule: &str) -> Vec<String>;
    pub fn get_elements(&self, rule: &str) -> Vec<Content>;
}
```

- [ ] **Step 1: 写集成测试 — 搜索结果解析**

准备一段搜索���果 HTML + 一个 `SearchRule`，验证 `get_elements(bookList)` + `get_string(name)` 能提取出书名列表。

- [ ] **Step 2: 实现 `AnalyzeRule` 调度逻辑**

- 根据 `Mode` 分派到对应引擎
- 执行 `##regex##replacement` 后处理
- 处理 `@get:{key}` 变量读取
- 处理 `&&` / `||` 链式规则

- [ ] **Step 3: 跑测试，提交**

```
feat(rules): implement AnalyzeRule dispatcher integrating CSS/JSON/regex engines
```

---

### Task 7: 替换规则执行链 — replace.rs

**Files:**
- Create: `crates/yeader-rules/src/replace.rs`

- [ ] **Step 1: 写测试**

```rust
#[test]
fn applies_enabled_rules_in_order() {
    let rules = vec![
        make_rule(1, "广告", "", true),
        make_rule(2, "\\s{2,}", " ", true),
        make_rule(3, "disabled", "nope", false), // 未启用，跳过
    ];
    let result = apply_replace_rules("这是 广告  文本", &rules);
    assert_eq!(result, "这是 文本");
}
```

- [ ] **Step 2: 实现 `apply_replace_rules`**

- [ ] **Step 3: 跑测试，提交**

```
feat(rules): implement replace rule execution chain
```

---

### Task 8: HTTP 客户端 — yeader-net

**Files:**
- Modify: `crates/yeader-net/Cargo.toml`
- Create: `crates/yeader-net/src/client.rs`
- Create: `crates/yeader-net/src/url_analyzer.rs`
- Create: `crates/yeader-net/src/encoding.rs`
- Modify: `crates/yeader-net/src/lib.rs`

依赖：`reqwest` (with cookies, gzip), `tokio`, `encoding_rs`, `chardetng`

- [ ] **Step 1: 添加 workspace 依赖**

`Cargo.toml` 添加:
```toml
chardetng = "0.1"
encoding_rs = "0.8"
reqwest = { version = "0.12", features = ["cookies", "gzip", "json"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

- [ ] **Step 2: 实现 `HttpClient`**

```rust
pub struct HttpClient {
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new() -> Self;
    pub async fn get(&self, url: &str, headers: &HeaderMap) -> Result<HttpResponse>;
    pub async fn post_form(&self, url: &str, body: &str, headers: &HeaderMap) -> Result<HttpResponse>;
    pub async fn post_json(&self, url: &str, body: &str, headers: &HeaderMap) -> Result<HttpResponse>;
}

pub struct HttpResponse {
    pub url: String,
    pub body: String,
    pub status: u16,
}
```

- [ ] **Step 3: 实现 `encoding.rs` — charset 检测**

从 HTTP Content-Type header 提取 charset，fallback 到 `chardetng` 嗅探 + `encoding_rs` 解码。

- [ ] **Step 4: 实现 `url_analyzer.rs` — 对齐上游 AnalyzeUrl**

处理 legado searchUrl 格式：
- 变量替换：`{{key}}` → 搜索关键词, `<1,2>` → 页码
- URL option（逗号后的 JSON）：`{"method":"POST","body":"key={{key}}"}`
- 提取 method / headers / body / charset

```rust
pub struct AnalyzedUrl {
    pub url: String,
    pub method: Method,
    pub headers: HeaderMap,
    pub body: Option<String>,
    pub charset: Option<String>,
}

pub fn analyze_url(raw: &str, key: &str, page: i32, base_url: &str) -> Result<AnalyzedUrl>;
```

- [ ] **Step 5: 写测试**

```rust
#[test]
fn parses_get_url_with_key() {
    let r = analyze_url("https://x.com/search?q={{key}}", "rust", 1, "");
    assert_eq!(r.url, "https://x.com/search?q=rust");
    assert!(matches!(r.method, Method::GET));
}

#[test]
fn parses_post_url_with_options() {
    let raw = r#"https://x.com/api, {"method":"POST","body":"keyword={{key}}&page=<1,{{page}}>"}"#;
    let r = analyze_url(raw, "test", 2, "");
    assert_eq!(r.url, "https://x.com/api");
    assert!(matches!(r.method, Method::POST));
    assert_eq!(r.body.as_deref(), Some("keyword=test&page=2"));
}
```

- [ ] **Step 6: 跑测试，提交**

```
feat(net): implement HTTP client with URL analyzer and charset detection
```

---

### Task 9: 搜索管线集成 — 串通 rules + net

**Files:**
- Modify: `crates/yeader-rules/src/lib.rs`
- Create: `crates/yeader-rules/src/pipeline.rs`

实现上游 `WebBook.searchBookAwait` + `BookList.analyzeBookList` 的等价逻辑：

```rust
pub struct SearchResult {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

pub async fn search_books(
    client: &HttpClient,
    source: &LegacyBookSource,
    keyword: &str,
    page: i32,
) -> Result<Vec<SearchResult>>;
```

流程：
1. `analyze_url(source.search_url, keyword, page, source.book_source_url)`
2. `client.get/post(...)` 获取 HTML/JSON
3. `AnalyzeRule::new(body, url)`
4. `get_elements(rule_search.book_list)` → 遍历每个元素
5. 对每个元素：`get_string(name)`, `get_string(author)`, `get_string(book_url, is_url=true)` 等

- [ ] **Step 1: 写集成测试（mock HTTP 或离线 HTML fixture）**

- [ ] **Step 2: 实现 `search_books`**

- [ ] **Step 3: 跑测试，提交**

```
feat(rules): implement search_books pipeline integrating net + rules
```

---

## Phase 2: 完整内容管线 + 本地阅读

### Task 10: 书籍详情管线

**Files:**
- Modify: `crates/yeader-rules/src/pipeline.rs`

实现 `fetch_book_info(client, source, book_url) -> BookInfo`。

对齐上游 `WebBook.getBookInfoAwait` + `BookInfo.analyzeBookInfo`：
- 请求 book_url
- 用 `rule_book_info.init` 规则初始化上下文
- 提取 name, author, intro, kind, cover_url, toc_url, last_chapter, word_count

- [ ] **Step 1: 写测试（离线 HTML fixture）**
- [ ] **Step 2: 实现**
- [ ] **Step 3: 提交**

```
feat(rules): implement fetch_book_info pipeline
```

---

### Task 11: 章节目录管线

**Files:**
- Modify: `crates/yeader-rules/src/pipeline.rs`

实现 `fetch_toc(client, source, book, toc_url) -> Vec<Chapter>`。

对齐上游 `BookChapterList.analyzeChapterList`：
- 请求 toc_url
- `get_elements(rule_toc.chapter_list)` → 章节列表
- 每章提取 `chapter_name`, `chapter_url`
- 支持 `next_toc_url` 多页目录

```rust
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
    pub is_vip: bool,
}
```

- [ ] **Step 1: 写测试**
- [ ] **Step 2: 实现**
- [ ] **Step 3: 提交**

```
feat(rules): implement fetch_toc pipeline with multi-page support
```

---

### Task 12: 正文获取管线

**Files:**
- Modify: `crates/yeader-rules/src/pipeline.rs`

实现 `fetch_content(client, source, book, chapter) -> String`。

对齐上游 `BookContent.analyzeContent`：
- 请求 chapter_url
- `get_string(rule_content.content)` → 正文
- 应用 replace_rules 清洗
- 支持 `next_content_url` 分页正文

- [ ] **Step 1: 写测试**
- [ ] **Step 2: 实现**
- [ ] **Step 3: 提交**

```
feat(rules): implement fetch_content pipeline with replace rules
```

---

### Task 13: 本地 TXT 阅读

**Files:**
- Create: `crates/yeader-reader/src/local_book.rs`
- Create: `crates/yeader-reader/src/txt.rs`

- 编码检测（`chardetng` + `encoding_rs`）
- TXT 目录规则（按正则拆章，如 `^第.+章`）
- 返回 `Vec<Chapter>` + 按章读取内容

- [ ] **Step 1: 写测试（包含 GBK 编码 fixture）**
- [ ] **Step 2: 实现 TXT 解析 + 分章**
- [ ] **Step 3: 提交**

```
feat(reader): implement local TXT reading with encoding detection
```

---

### Task 14: 本地 EPUB 阅读

**Files:**
- Create: `crates/yeader-reader/src/epub.rs`
- Modify: `crates/yeader-reader/Cargo.toml` (添加 epub crate)

- EPUB 解包
- 提取 TOC (NCX / nav)
- 按章获取 XHTML → 纯文本

- [ ] **Step 1: 写测试（用小型 EPUB fixture）**
- [ ] **Step 2: 实现 EPUB 解析**
- [ ] **Step 3: 提交**

```
feat(reader): implement local EPUB reading
```

---

## Phase 3: Tauri 集成 + 书架

### Task 15: 扩展 yeader-library — 书架完整 schema

**Files:**
- Modify: `crates/yeader-library/src/db.rs`
- Modify: `crates/yeader-library/src/repo.rs`

新增表：
- `books` — 书架条目（url PK, name, author, cover_url, source_url, toc_url, last_read_at, group_id, type, intro）
- `book_groups` — 分组
- `bookmarks` — 书签

新增 repo：`BookRepo`, `BookGroupRepo`, `BookmarkRepo`

- [ ] **Step 1: 写测试**
- [ ] **Step 2: 扩展 schema migration + repo**
- [ ] **Step 3: 提交**

```
feat(library): add books, book_groups, bookmarks tables and repos
```

---

### Task 16: Tauri Commands — 完整 IPC 层

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/backup.rs`
- Create: `src-tauri/src/commands/library.rs`
- Create: `src-tauri/src/commands/search.rs`
- Create: `src-tauri/src/commands/reader.rs`
- Create: `src-tauri/src/state.rs` (AppState: Database + HttpClient)

暴露 IPC commands：

```rust
// backup
import_backup(path: String) -> Result<ImportSummary, String>

// library
list_book_sources() -> Vec<LegacyBookSource>
list_rss_sources() -> Vec<LegacyRssSource>
list_replace_rules() -> Vec<LegacyReplaceRule>
delete_book_source(url: String) -> bool
list_books() -> Vec<Book>
add_book_to_shelf(book: Book)
remove_book(url: String) -> bool

// search
search_books(source_url: String, keyword: String, page: i32) -> Vec<SearchResult>

// reader
fetch_book_info(book_url: String, source_url: String) -> BookInfo
fetch_toc(toc_url: String, source_url: String) -> Vec<Chapter>
fetch_content(chapter_url: String, source_url: String) -> String
get_reading_progress(book_id: String) -> Option<ReadingProgress>
save_reading_progress(progress: ReadingProgress)
```

- [ ] **Step 1: 创建 `AppState` 持有 Database + HttpClient**
- [ ] **Step 2: 实现各 command 模块**
- [ ] **Step 3: 注册所有 commands 到 `invoke_handler`**
- [ ] **Step 4: 跑 `cargo check -p yeader`，确认编译通过**
- [ ] **Step 5: 提交**

```
feat(tauri): expose full IPC command layer for backup/library/search/reader
```

---

## Phase 4: 前端 UI + 高级功能

### Task 17: 前端框架搭建

选择 UI 框架（建议 Solid / Vue / React），搭建路由：
- `/` — 书架页
- `/search` — 搜索页
- `/reader/:bookId` — 阅读页
- `/settings` — 设置页（书源管理、替换规则、导入备份）

### Task 18: 书架 UI

从 Tauri IPC 加载书架列表，展示封面、书名、最后阅读进度。点击进入阅读。

### Task 19: 搜索 UI

多书源并发搜索，流式展示结果。选中后 fetch_book_info → add_to_shelf。

### Task 20: ��读器 UI

章节内容渲染、翻页/滚动、字号/行距调节、夜间模式、进度自动保存。

### Task 21: 设置 UI

书源管理（列表、启用/禁用、删除）、替换规则管理、备份导入。

### Task 22: JS 规则执行（高级）

为 `yeader-rules` 添加 JS 运行时（`boa_engine` 或 `quick-js`）：
- 解析 `<js>...</js>` 和 `{{js: ...}}` 块
- 注入 `result`, `baseUrl`, `source`, `java` (JsExtensions 等价) 绑定
- 缓存编译后的脚本

### Task 23: 多源并发搜索

跨 N 个书源同时搜索，`tokio::spawn` + 流式返回。

### Task 24: WebDAV 同步（可选）

进度 / 书源 / 书签的 WebDAV 推拉。

---

## 依赖总结

### 需新增的 workspace 依赖

| Crate | 用途 | Phase |
|---|---|---|
| `scraper` | CSS 选择器 HTML 解析 | 1 |
| `regex` | 正则引擎 | 1 |
| `reqwest` (cookies, gzip) | HTTP 客户端 | 1 |
| `tokio` (rt-multi-thread) | 异步运行时 | 1 |
| `encoding_rs` | 字符编码转换 | 1 |
| `chardetng` | 编码自动检测 | 1 |
| `epub` | EPUB 解析 | 2 |
| `boa_engine` 或 `quick-js` | JS 规则执行 | 4 |

### Crate 依赖拓扑（目标态）

```
src-tauri
  ├─ yeader-rules (规则引擎)
  │   ├─ yeader-models
  │   ├─ scraper, regex
  │   └─ (Phase 4: boa_engine)
  ├─ yeader-net (HTTP)
  │   ├─ reqwest, tokio, encoding_rs, chardetng
  │   └─ yeader-models
  ├─ yeader-reader (阅读编排)
  │   ├─ yeader-rules
  │   ├─ yeader-net
  │   ├─ yeader-library
  │   └─ yeader-models
  ├─ yeader-library (SQLite 持久化)
  │   ├─ rusqlite
  │   └─ yeader-models
  ├─ yeader-backup (备份导入)
  │   ├─ zip
  │   └─ yeader-models
  └─ yeader-protocol (URI 解析)
      └─ yeader-models
```
