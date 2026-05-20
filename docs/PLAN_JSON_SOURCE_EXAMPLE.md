# JSON 规则源案例

JSON 规则源是 Yeader 四条路径中的 **Path 1**：声明式选择器，零代码。

## 核心理念

一个 JSON 文件描述一个网站的所有交互：
- **请求模板**：URL、方法、请求头、分页变量
- **选择器**：CSS / JSONPath / XPath / Regex 从 HTML/JSON 中提取字段
- **能力清单**：Search（搜索）、Detail（详情）、Toc（目录）、Content（正文）、List（分类浏览）

网站 → HTTP 请求 → 规则选择器提取 → Yeader Atom → 阅读器展示

> ⚠️ **字段命名暂定**：本文档中的字段名（如 `name`、`bookUrl`、`intro`、`kind` 等）为草案命名，尚未与主程序（`crates/yeader-models/src/source_format.rs`）中 `From<&LegacyBookSource>` 既有的规范字段（`title`、`url`、`summary`、`category`）统一。最终以主程序代码的字段名为准。

---

## 案例 1：czbooks.net 小说源

**网站**: https://czbooks.net/ — 繁体中文在线小说站
**媒体类型**: `novel`
**反爬策略**: 使用 `impersonate: "chrome137"` 绕过 Cloudflare

### 5 种能力

| 能力 | 选择器引擎 | 说明 |
|------|-----------|------|
| `search` | CSS | 搜索页 /search?keyword={{key}}，提取书名、作者、封面、分类 |
| `detail` | CSS | 书籍详情页，提取书名、作者、介绍、分类、封面 |
| `toc` | CSS / Text | 章节目录，提取章节名和 URL |
| `content` | CSS | 章节正文，提取 HTML 内容 |
| `list` | CSS | 23 个分类浏览（排行、分类、标签），支持排序选项 |

### 关键选择器

```json
{
  "kind": "search",
  "request": {
    "url": "https://czbooks.net/search?keyword={{key}}",
    "method": "GET"
  },
  "item": { "engine": "css", "query": ".novel-list .novel-item" },
  "fields": {
    "name": { "engine": "css", "query": ".novel-title", "output": "text" },
    "bookUrl": { "engine": "css", "query": "a", "output": "href" },
    "author": { "engine": "css", "query": ".author", "output": "text" },
    "coverUrl": { "engine": "css", "query": "img", "output": "src" },
    "intro": { "engine": "css", "query": ".description", "output": "text" },
    "kind": { "engine": "css", "query": ".category-tag", "output": "text" }
  }
}
```

### TOC 特殊处理

```json
{
  "kind": "toc",
  "request": {
    "url": "{{bookUrl}}"
  },
  "item": { "engine": "css", "query": "#chapter-list li a" },
  "fields": {
    "chapterName": { "engine": "text", "query": "" },
    "chapterUrl": { "engine": "css", "query": "", "output": "href" }
  }
}
```

`Text` 引擎表示「直接取当前元素的文本」，不需要子选择器。`output: "href"` 表示提取当前元素的 `href` 属性。

---

## 案例 2：待实现的通用漫画源

**目标网站**: 典型的漫画阅读站（如 manhuagui、copymanga）
**媒体类型**: `comic`

### 选择器策略

```json
{
  "id": "example-comic",
  "name": "Example Comic Source",
  "mediaType": "comic",
  "homepage": "https://comic.example.com",
  "capabilities": [
    {
      "kind": "search",
      "request": {
        "url": "https://comic.example.com/search?q={{key}}&page={{page}}",
        "method": "GET",
        "pagination": { "variable": "page", "firstPage": 1, "step": 1 }
      },
      "item": { "engine": "css", "query": ".comic-card" },
      "fields": {
        "name": { "engine": "css", "query": ".comic-title", "output": "text" },
        "bookUrl": { "engine": "css", "query": "a.cover", "output": "href" },
        "coverUrl": { "engine": "css", "query": "img", "output": "src" },
        "lastChapter": { "engine": "css", "query": ".latest-chapter", "output": "text" }
      }
    },
    {
      "kind": "toc",
      "request": { "url": "{{bookUrl}}" },
      "item": { "engine": "css", "query": ".chapter-list a" },
      "fields": {
        "chapterName": { "engine": "text", "query": "" },
        "chapterUrl": { "engine": "css", "query": "", "output": "href" }
      }
    },
    {
      "kind": "content",
      "request": { "url": "{{chapterUrl}}" },
      "fields": {
        "content": { "engine": "css", "query": ".comic-reader img", "output": "src", "all": true }
      }
    }
  ]
}
```

### 漫画源的特殊之处

- **content 能力**：漫画的「正文」是图片列表，`"all": true` 提取所有匹配的 `<img>` 的 `src`
- **不需要 Detail 能力**：漫画通常不需要独立的详情页解析（搜索卡片已包含足够信息）
- **toc**：章节列表可能在单一页面上，不需要分页

---

## 案例 3：JSON API 源（JSONPath 选择器）

**目标**: 使用 JSONPath 从 REST API 提取内容
**媒体类型**: `novel`

```json
{
  "id": "example-api-novel",
  "name": "Example API Novel Source",
  "mediaType": "novel",
  "homepage": "https://api.example.com",
  "capabilities": [
    {
      "kind": "search",
      "request": {
        "url": "https://api.example.com/novels/search?keyword={{key}}",
        "method": "GET",
        "headers": { "Accept": "application/json" }
      },
      "item": { "engine": "jsonPath", "query": "$.data.items[*]" },
      "fields": {
        "name": { "engine": "jsonPath", "query": "title" },
        "author": { "engine": "jsonPath", "query": "author.name" },
        "bookUrl": { "engine": "jsonPath", "query": "url" },
        "coverUrl": { "engine": "jsonPath", "query": "cover.url" },
        "intro": { "engine": "jsonPath", "query": "description" },
        "kind": { "engine": "jsonPath", "query": "category" },
        "wordCount": { "engine": "jsonPath", "query": "wordCount" }
      }
    }
  ]
}
```

### JSONPath vs CSS 的区别

| 特性 | CSS | JSONPath |
|------|-----|----------|
| 数据格式 | HTML | JSON |
| 选择器语法 | `.class`, `tag`, `#id` | `$.path.to.field`, `$[*]` |
| 字段提取 | 需要 `output: "text"/"href"/"src"` | 隐式（路径直接定位值） |
| 适用场景 | 服务端渲染页面 | REST API / GraphQL 响应 |

### JSONPath 模式下 `Text` 引擎的简化

在 JSON 内容中，如果 selector 的 key 恰好是 JSON 对象的直接子 key，可以直接用 key 名作为规则（LinkedTreeMap 模式）：

```json
"fields": {
  "name": { "engine": "jsonPath", "query": "title" }
}
```

等价于 `obj["title"]`，不需要写 `$.title`。

---

## 选择器引擎速查

| 引擎 | 适用数据 | 选择器示例 | output 选项 |
|------|---------|-----------|------------|
| `css` | HTML | `.class`, `tag`, `#id`, `tag.class@extractor` | text, html, href, src, class, id |
| `jsonPath` | JSON | `$.store.books[*].title` | 无需（路径即值） |
| `xPath` | XML/HTML | `//div[@class='item']/a/@href` | text, html |
| `regex` | 文本 | `Chapter (\d+)` | 无（捕获组即值） |
| `text` | 元素 | `""`（空查询） | 直接取当前元素文本 |
| `javaScript` | 任意 | JS 代码片段 | 脚本返回值 |
| `legacyLegado` | 任意 | legado 格式规则（兼容旧版） | 规则内嵌 @extractor |

## 变量与模板

请求 URL 和选择器规则中可以使用变量：

```
{{key}}        — 搜索关键词
{{page}}       — 当前页码
{{bookUrl}}    — 书籍 URL
{{chapterUrl}} — 章节 URL
{{bookId}}     — 书籍 ID（从 URL 提取）
{{chapterId}}  — 章节 ID（从 URL 提取）
{{{变量名}}}   — 自定义变量（源级别或分类级别）
```

## 下一步

- [ ] 完善 czbooks.net 的 list 分类模板变量
- [ ] 新增 1-2 个漫画源 JSON 案例并验证
- [ ] 新增 1 个 JSON API 源案例并验证
- [ ] 将探索/搜索结果自动缓存为 Yeader Atom feed
