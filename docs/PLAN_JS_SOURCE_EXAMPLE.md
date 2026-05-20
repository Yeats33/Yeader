# JS 脚本源案例

JS 脚本源是 Yeader 四条路径中的 **Path 2**：脚本驱动的聚合与加工，比 JSON 规则灵活，比 Wasm 插件轻量。

## 核心理念

JSON 规则源适合「一个请求 → 一个页面 → 提取字段」的线性流程。但很多场景需要：

- **多请求聚合**：从多个 RSS/API 端点拉取数据，合并成一个 feed
- **条件逻辑**：根据响应内容决定下一步请求（登录态检测、分页判断）
- **数据加工**：对提取结果做正则清理、日期格式化、分类推断
- **状态管理**：记住上次抓取位置，增量更新

JS 脚本源填补了这个空白——它运行在沙箱化的 Rhai 引擎中，有受限的 HTTP 和 DOM 能力，无法访问文件系统或网络之外的能力。

```
多个网站/API → JS 脚本编排请求 → 提取+聚合 → Yeader Atom → 阅读器展示
```

---

## 案例 1：V2EX 聚合源

**目标**: 将 V2EX 的多个 RSS 订阅聚合成一个可筛选的 feed

**参考**: https://blog.v2ex.com/rss/ — V2EX 提供丰富的 RSS 端点：

| RSS 端点 | 内容 |
|----------|------|
| `https://www.v2ex.com/feed/tab/tech.xml` | 技术 |
| `https://www.v2ex.com/feed/tab/creative.xml` | 创造 |
| `https://www.v2ex.com/feed/tab/play.xml` | 玩乐 |
| `https://www.v2ex.com/feed/tab/apple.xml` | Apple |
| `https://www.v2ex.com/feed/tab/jobs.xml` | 酷工作 |
| `https://www.v2ex.com/feed/tab/deals.xml` | 交易 |
| `https://www.v2ex.com/feed/tab/city.xml` | 城市 |
| `https://www.v2ex.com/feed/tab/qna.xml` | 问与答 |
| `https://www.v2ex.com/feed/tab/hot.xml` | 最热 |
| `https://www.v2ex.com/feed/tab/all.xml` | 全部 |

### YeaderSource 结构

```json
{
  "id": "v2ex-aggregator",
  "name": "V2EX 聚合",
  "mediaType": "rss",
  "homepage": "https://www.v2ex.com",
  "publisher": "Yeader Community",
  "tags": ["社区", "技术", "聚合"],
  "requestDefaults": {
    "headers": {
      "User-Agent": "Yeader/1.0"
    },
    "timeoutMs": 15000
  },
  "exploreCategories": [
    {
      "key": "tech",
      "label": "技术",
      "variables": { "feedUrl": "https://www.v2ex.com/feed/tab/tech.xml" }
    },
    {
      "key": "creative",
      "label": "创造",
      "variables": { "feedUrl": "https://www.v2ex.com/feed/tab/creative.xml" }
    },
    {
      "key": "jobs",
      "label": "酷工作",
      "variables": { "feedUrl": "https://www.v2ex.com/feed/tab/jobs.xml" }
    },
    {
      "key": "qna",
      "label": "问与答",
      "variables": { "feedUrl": "https://www.v2ex.com/feed/tab/qna.xml" }
    },
    {
      "key": "hot",
      "label": "最热",
      "variables": { "feedUrl": "https://www.v2ex.com/feed/tab/hot.xml" }
    }
  ],
  "capabilities": [
    {
      "kind": "feed",
      "request": {
        "url": "{{{feedUrl}}}",
        "method": "GET"
      },
      "actions": [
        {
          "kind": "beforeExtract",
          "script": "// 记录请求时间戳\nresult.timestamp = Date.now();\nresult"
        },
        {
          "kind": "afterExtract",
          "script": "// 为每个 item 添加来源标签\nfor item in items {\n  item.sourceLabel = \"V2EX\";\n  item.category = feedCategory || \"general\";\n}\nitems"
        }
      ],
      "item": { "engine": "css", "query": "entry, item" },
      "fields": {
        "name": { "engine": "css", "query": "title", "output": "text" },
        "author": { "engine": "css", "query": "author name", "output": "text" },
        "itemUrl": { "engine": "css", "query": "link", "output": "href" },
        "date": { "engine": "css", "query": "published, updated", "output": "text" },
        "summary": { "engine": "css", "query": "summary, content", "output": "html" }
      }
    }
  ]
}
```

### 单个分类 feed 的执行流

```
用户选择「技术」分类
    ↓
YeaderCapability.feed 激活
    ↓
BeforeExtract: 记录时间戳
    ↓
HTTP GET https://www.v2ex.com/feed/tab/tech.xml
    ↓
CSS 选择器提取 entry/item 列表
    ↓
AfterExtract: 为每个 item 添加 sourceLabel + category
    ↓
返回 Yeader Atom items → 中间面板展示
```

### 关键设计决策

- **分类变量 `{{{feedUrl}}}`**：三重大括号表示源级别变量，在 exploreCategories 中定义
- **BeforeExtract**：在请求前运行，可以修改请求参数、设置自定义 header
- **AfterExtract**：在提取后运行，可以对结果做批量加工（添加标签、过滤、排序）
- **item 选择器 `entry, item`**：兼容 RSS 1.0 (`entry`) 和 RSS 2.0 (`item`)

---

## 案例 2：多源聚合脚本（全量拉取 + 合并）

**场景**：一次性拉取 V2EX 所有 10 个 RSS 端点，合并去重后按时间排序

### 为什么需要 JS 脚本

JSON 规则源的 `feed` capability 只能发一个 HTTP 请求。多源聚合需要：
1. 并行或串行发多个 HTTP 请求
2. 合并结果
3. 去重（按 URL）
4. 排序（按时间）
5. 分页（取前 N 条）

这超出了声明式 JSON 规则的能力范围。JS 脚本源可以直接写这段逻辑。

### JS 脚本（Rhai）

```rhai
// V2EX 全量聚合脚本
// 在 Yeader JS 沙箱中运行

let FEEDS = [
  "https://www.v2ex.com/feed/tab/tech.xml",
  "https://www.v2ex.com/feed/tab/creative.xml",
  "https://www.v2ex.com/feed/tab/play.xml",
  "https://www.v2ex.com/feed/tab/apple.xml",
  "https://www.v2ex.com/feed/tab/jobs.xml",
  "https://www.v2ex.com/feed/tab/deals.xml",
  "https://www.v2ex.com/feed/tab/city.xml",
  "https://www.v2ex.com/feed/tab/qna.xml",
  "https://www.v2ex.com/feed/tab/hot.xml",
  "https://www.v2ex.com/feed/tab/all.xml"
];

let all_items = [];
let seen_urls = #{};  // hash set for dedup

for feed_url in FEEDS {
  let resp = http_get(feed_url, {
    headers: #{ "User-Agent": "Yeader/1.0" },
    timeout: 10000
  });

  if resp.status != 200 {
    continue;
  }

  let feed = parse_rss(resp.body);
  let category = extract_category_from_url(feed_url);

  for item in feed.items {
    let url = item.link;
    if url in seen_urls {
      continue;
    }
    seen_urls.insert(url);
    item.category = category;
    all_items.push(item);
  }
}

// 按时间降序排序
all_items.sort(fn(a, b) { b.pub_date - a.pub_date });

// 只取最近 200 条
all_items = all_items.slice(0, 200);

all_items
```

### YeaderSource 结构

```json
{
  "id": "v2ex-full-aggregator",
  "name": "V2EX 全量聚合",
  "mediaType": "rss",
  "homepage": "https://www.v2ex.com",
  "capabilities": [
    {
      "kind": "feed",
      "request": {
        "url": "script://v2ex-aggregate",
        "method": "SCRIPT"
      },
      "actions": [
        {
          "kind": "beforeExtract",
          "script": "// 上面的 Rhai 聚合脚本\n// 脚本作为 beforeExtract action 运行\n// 返回的 items 数组将作为提取结果"
        }
      ]
    }
  ]
}
```

### JS 沙箱 API

Yeader 向 Rhai 脚本暴露以下受限 API：

| 函数 | 说明 |
|------|------|
| `http_get(url, opts)` | 发送 GET 请求，返回 `{status, body, headers}` |
| `http_post(url, body, opts)` | 发送 POST 请求 |
| `parse_html(html)` | 解析 HTML 字符串为 DOM |
| `parse_rss(xml)` | 解析 RSS/Atom XML 为结构化对象 |
| `parse_json(text)` | 解析 JSON 字符串 |
| `css_select(html, selector)` | CSS 选择器提取 |
| `xpath_select(html, xpath)` | XPath 提取 |
| `jsonpath_select(obj, path)` | JSONPath 提取 |
| `extract_category_from_url(url)` | 从 V2EX URL 提取分类标签 |

---

## 案例 3：条件请求 + 登录态 JS 源

**场景**：某些网站需要先获取 token/cookie 才能访问内容

### 脚本示例

```rhai
// 带登录态的源
let LOGIN_URL = "https://example.com/api/login";
let CONTENT_URL = "{{{targetUrl}}}";

// Step 1: 登录获取 token
let login_resp = http_post(LOGIN_URL, #{
  username: "{{{username}}}",
  password: "{{{password}}}"
}, #{ headers: #{ "Content-Type": "application/json" } });

if login_resp.status != 200 {
  throw "Login failed";
}

let token = parse_json(login_resp.body).token;

// Step 2: 用 token 请求内容
let content_resp = http_get(CONTENT_URL, #{
  headers: #{ "Authorization": "Bearer " + token }
});

// Step 3: 解析内容
let html = content_resp.body;
let items = [];

for elem in css_select(html, ".article-item") {
  items.push(#{
    title: elem.css(".title").text(),
    link: elem.css("a").attr("href"),
    author: elem.css(".author").text(),
    date: elem.css(".date").text(),
    summary: elem.css(".excerpt").html()
  });
}

items
```

### YeaderSource 结构

```json
{
  "id": "authenticated-source",
  "name": "需要登录的源",
  "mediaType": "rss",
  "variables": {
    "username": "",
    "password": "",
    "targetUrl": ""
  },
  "capabilities": [
    {
      "kind": "feed",
      "actions": [
        {
          "kind": "beforeRequest",
          "script": "// BeforeRequest: 登录并获取 token，存入变量\nlet token = do_login(vars.username, vars.password);\nset_var(\"authToken\", token);\n"
        }
      ],
      "request": {
        "url": "{{{targetUrl}}}",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer {{{authToken}}}"
        }
      },
      "item": { "engine": "css", "query": ".article-item" },
      "fields": {
        "name": { "engine": "css", "query": ".title", "output": "text" },
        "author": { "engine": "css", "query": ".author", "output": "text" },
        "itemUrl": { "engine": "css", "query": "a", "output": "href" }
      }
    }
  ]
}
```

---

## Path 2 vs Path 1 vs Path 3 对比

| 维度 | Path 1 JSON 规则 | Path 2 JS 脚本 | Path 3 Wasm 插件 |
|------|-----------------|---------------|-----------------|
| **编写难度** | 低（声明式） | 中（需要编程） | 高（需要 Rust/C 知识） |
| **灵活性** | 低（单请求线性流程） | 中（多请求+条件+循环） | 高（任意逻辑） |
| **性能** | 高（原生执行） | 中（Rhai 解释执行） | 高（Wasm 编译执行） |
| **安全** | 高（无代码执行） | 中（沙箱限制） | 中（Wasm 沙箱） |
| **适用场景** | 简单网站、REST API | 多源聚合、条件请求、数据加工 | 自定义协议、复杂算法、性能敏感 |
| **分发方式** | JSON 文件 | JSON + Rhai 脚本 | `.wasm` 二进制 |
| **调试难度** | 低 | 中 | 高 |

### 选择指南

```
是否需要多个 HTTP 请求？
  ├── 否 → Path 1 JSON 规则
  └── 是 → 需要复杂逻辑（条件、循环、状态）？
            ├── 否 → Path 2 JS 脚本（Rhai 聚合）
            └── 是 → Path 3 Wasm 插件
```

---

## Action 执行时序

```
BeforeRequest actions
    ↓
HTTP 请求
    ↓
BeforeExtract actions（在结果 HTML/JSON 上运行预处理）
    ↓
Item 选择器（CSS / JSONPath / XPath 定位元素列表）
    ↓
Field 选择器（逐个字段提取）
    ↓
AfterExtract actions（对提取结果做后处理、聚合、过滤）
    ↓
返回 Yeader Atom items
```

### Action 种类速查

| Action Kind | 执行时机 | 典型用途 | 可用变量 |
|-------------|---------|---------|---------|
| `BeforeRequest` | HTTP 请求前 | 动态计算 URL、获取 token、设置 header | `vars`, `request` |
| `BeforeExtract` | 请求完成后、提取前 | HTML/JSON 预处理、注入时间戳 | `result`（响应体）, `vars` |
| `AfterExtract` | 字段提取完成后 | 数据清洗、添加标签、排序、去重 | `items`（提取结果数组）, `vars` |

---

## 当前实现状态

### 已实现
- [x] Rhai 引擎集成（`js_engine.rs`）
- [x] `eval_js()` 基础 JS 表达式求值
- [x] `JsTemplateExpander` 模板变量展开（`{{...}}`）
- [x] `AnalyzeRule` 支持 `JavaScript` 选择器引擎
- [x] `BeforeExtract` 和 `AfterExtract` action 执行（`search.rs` 中 `execute_before_extract_actions`）
- [x] YeaderSource 模型含 `actions: Vec<YeaderAction>` 字段

### 待实现
- [ ] Rhai 沙箱 API：`http_get`, `http_post`, `parse_rss`, `parse_json`, `css_select` 等
- [ ] 多请求聚合脚本执行模式（`method: "SCRIPT"` 请求）
- [ ] 脚本超时和资源限制（防止无限循环/内存耗尽）
- [ ] `BeforeRequest` action 执行（当前仅支持 BeforeExtract/AfterExtract）
- [ ] 脚本错误报告（行号、上下文，方便调试）
- [ ] V2EX 聚合源完整实现并验证

---

## 下一步

- [ ] 实现 Rhai 沙箱 HTTP API（`http_get`, `http_post`）
- [ ] 实现 `parse_rss()` Rhai 函数（复用 yeader-net RSS 解析）
- [ ] 创建 V2EX 聚合源示例并端到端测试
- [ ] 实现 `BeforeRequest` action 执行
- [ ] 添加脚本超时机制（默认 30s）
- [ ] 完善脚本错误上下文报告
