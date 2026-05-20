# 插件源案例：本地 EPUB

插件源是 Yeader 四条路径中的 **Path 3**：原生能力插件，用 Rust 实现并通过 Tauri 命令暴露给前端。

## 核心理念

JSON 规则和 JS 脚本都是「从网络获取内容」的路径。EPUB 插件源代表另一种模式——**本地文件作为内容源**。它：

- 解析本地 EPUB 文件（或从 URL 下载）
- 提取元数据（书名、作者、封面）
- 构建章节目录
- 将图片等资源内联为 base64 data URI
- 持久化到 SQLite 数据库
- 通过 ReaderView 提供完整的阅读体验（章节导航、书签、主题切换）

```
EPUB 文件 → rbook 解析 → EpubBook 结构 → SQLite 存储 → ReaderView 渲染
                                              ↓
                               Book.url = "local://epub/{uuid}"
```

---

## 架构总览

### YeaderSource 模型

```json
{
  "id": "local://epub",
  "name": "本地 EPUB",
  "mediaType": "novel",
  "homepage": "local://epub",
  "publisher": "Yeader Official",
  "tags": ["官方", "本地", "EPUB"],
  "enabled": true,
  "capabilities": [
    {
      "kind": "detail",
      "item": { "engine": "css", "query": "" },
      "fields": {
        "title": { "engine": "text", "query": "" },
        "author": { "engine": "text", "query": "" },
        "coverUrl": { "engine": "text", "query": "" }
      }
    },
    {
      "kind": "toc",
      "item": { "engine": "css", "query": "" },
      "fields": {
        "chapterName": { "engine": "text", "query": "" },
        "chapterUrl": { "engine": "text", "query": "" }
      }
    },
    {
      "kind": "content",
      "fields": {
        "body": { "engine": "text", "query": "" }
      }
    }
  ],
  "defaultView": "reader"
}
```

**关键字段 `defaultView: "reader"`**：声明此源的订阅默认使用 ReaderView（完整阅读器体验）。

实际上，EPUB 源的 capabilities 并不走 AnalyzeRule 选择器引擎——它的能力完全由原生 Tauri 命令实现。YeaderSource 模型中的 capabilities 是「能力声明」，实际执行由 Rust 命令接管。

### Tauri 命令表

| 命令 | 说明 | 调用场景 |
|------|------|---------|
| `import_epub` | 从本地路径导入 EPUB | 用户选择文件 / 粘贴路径 |
| `import_epub_url` | 从 URL 下载并导入 | 用户输入下载链接 |
| `list_local_epubs` | 列出所有本地 EPUB | 书架页加载 |
| `read_local_epub` | 读取指定章节内容 | 阅读器切换章节 |
| `get_epub_toc` | 获取 EPUB 章节目录 | 阅读器加载 TOC |
| `delete_local_epub` | 删除 EPUB 及其文件 | 书架页删除操作 |

---

## 导入流程

### 1. 文件导入 (`import_epub`)

```
用户拖放/选择 .epub 文件
    ↓
Tauri 对话框 → 获取文件路径
    ↓
import_epub(path):
  ├── 验证文件存在
  ├── 生成 UUID 作为 book_id
  ├── 创建 epub_library/{book_id}/ 目录
  ├── 复制 EPUB 到目录
  ├── rbook::Epub::open() 解析
  ├── 提取 title, author, cover
  ├── 封面 → base64 data URI
  ├── 封面 → 保存为文件 (cover.jpg/png)
  ├── 构建 Book 记录 (url = "local://epub/{uuid}")
  └── SQLite upsert
    ↓
前端刷新书架 → 新书出现
```

### 2. URL 导入 (`import_epub_url`)

```
用户输入 URL
    ↓
reqwest GET (30s 超时)
    ↓
写入临时文件 (.epub)
    ↓
同 import_epub 流程
```

### Book 记录结构

```json
{
  "url": "local://epub/a1b2c3d4-...",
  "name": "三体",
  "author": "刘慈欣",
  "cover_url": "data:image/jpeg;base64,/9j/4AAQ...",
  "source_url": "local://epub",
  "book_type": "epub",
  "last_read_at": "2026-05-20T10:30:00+08:00",
  "extra": {
    "epub_path": "/path/to/epub_library/a1b2c3d4/a1b2c3d4.epub",
    "cover_path": "/path/to/epub_library/a1b2c3d4/cover.jpg",
    "chapter_count": 34
  }
}
```

---

## 阅读流程

### 章节加载

```
ReaderPage 收到 bookUrl="local://epub/{uuid}"
    ↓
loadReaderState():
  ├── isLocalEpub = bookUrl.startsWith("local://epub/")
  ├── getEpubToc(bookUrl) → Tauri 命令
  │     ├── 查 SQLite 获取 epub_path
  │     ├── rbook 解析 EPUB
  │     └── 返回 Chapter[] (title, url/href)
  └── 构建 ReaderState { chapters, bookInfo }
    ↓
用户点击章节 → readChapterContent()
  ├── readLocalEpub(bookUrl, chapterIndex) → Tauri 命令
  │     ├── 查 SQLite 获取 epub_path
  │     ├── rbook 解析 EPUB
  │     └── 返回该章节 XHTML 内容
  └── 渲染到 <article> 中 (dangerouslySetInnerHTML)
```

### EPUB 解析细节（Rust 侧）

```
rbook::Epub::open(path)
    ↓
├── metadata → title, author
├── toc → 递归展平为 EpubChapter[]（含 level 层级）
├── spine → 按顺序读取章节 XHTML
├── manifest → 所有资源的 bytes
│     └── build_inline_map() → href → data: URI 映射
├── cover_image → 封面数据
    ↓
inline_images() 处理每章 XHTML:
  <img src="images/cover.jpg" />
    ↓ base64 替换
  <img src="data:image/jpeg;base64,..." />
```

**关键设计——图片内联**：EPUB 内的图片资源全部转为 base64 data URI，确保阅读时不需要访问原始 ZIP 包，也避免跨域/资源加载问题。

---

## 前端集成

### 书架页（BookshelfPage）

```typescript
// 按 source_url 区分本地 vs 网络书籍
const localBooks = books.filter(book => book.source_url === "local://epub");
const webBooks = books.filter(book => book.source_url !== "local://epub");
```

书架页提供三个 tab：
- **全部** — 所有书籍
- **本地文件** — `source_url === "local://epub"`（EPUB 插件源的书）
- **网站内容** — 其他源的书

### 导入入口

```
BookshelfPage > "+ 导入" 下拉菜单
  ├── 导入本地 EPUB — Tauri 文件对话框选择
  ├── 输入路径 — 手动输入绝对路径
  └── 输入 URL — 粘贴下载链接
```

### 删除流程

```
用户点击删除按钮
  ↓
确认对话框 (Tauri dialog ask)
  ↓
deleteLocalEpub(bookUrl):
  ├── 查 SQLite 获取 epub_path
  ├── 删除整个 book 目录 (EPUB + cover)
  └── 从 SQLite 删除记录
```

---

## 插件生命周期

```
安装阶段        运行阶段              卸载阶段
─────────      ─────────            ─────────
 无（内置）     Tauri 命令注册        无（内置）
              epub_library/ 目录
              SQLite Books 表
              Bookmark 系统
              ReaderStyle 系统
```

EPUB 插件是**官方内置插件**，随 Yeader 二进制分发。未来插件市场中的其他插件会有独立的安装/卸载生命周期。

---

## 与其他路径的对比

| 维度 | Path 1 JSON | Path 2 JS 脚本 | Path 3 EPUB 插件 |
|------|-----------|---------------|-----------------|
| 内容来源 | 网络 | 网络 | 本地文件 |
| 存储 | 不存储（在线读） | 不存储（在线读） | 完整存储（EPUB + 封面） |
| 离线可用 | 否 | 否 | **是** |
| 解析引擎 | AnalyzeRule | Rhai 沙箱 | rbook（Rust） |
| 图片处理 | 远程 URL | 远程 URL | **内联 base64** |
| 阅读体验 | OnlineReaderView | ArticleView | **ReaderView**（全功能） |
| 书签 | 无 | 无 | **有**（SQLite 持久化） |
| 阅读进度 | 无 | 无 | **有**（SQLite 持久化） |
| 主题 | 无 | 无 | **有**（浅色/深色/护眼） |

---

## 为什么 EPUB 是 Path 3 插件

1. **需要原生解析能力**：EPUB 是 ZIP 格式，需要解压 + XML 解析 + XHTML 渲染。这超出了 JS 沙箱的能力范围（沙箱不暴露文件系统和二进制处理）。

2. **需要本地存储管理**：EPUB 文件需要复制到 app 数据目录、封面需要提取保存、删除需要清理文件——这些都是原生文件系统操作。

3. **需要全功能阅读器视图**：EPUB 阅读需要 TOC 展平、章节导航、进度记忆、书签系统、主题切换、字体设置、繁简转换——这是一个完整的阅读器应用，不是简单的 HTML 渲染。

4. **离线优先**：Path 1/2 是纯在线模式。Path 3 支持离线阅读，必须有本地文件管理能力。

---

## 当前实现状态

### 已实现
- [x] `rbook` EPUB 解析（`crates/yeader-reader/src/epub.rs`）
- [x] `import_epub` — 本地文件导入
- [x] `import_epub_url` — URL 下载导入
- [x] `list_local_epubs` — 列出所有本地 EPUB
- [x] `read_local_epub` — 按章节读取内容
- [x] `get_epub_toc` — 章节目录
- [x] `delete_local_epub` — 删除（文件 + 数据库）
- [x] 封面 base64 内联
- [x] 图片内联（`inline_images()` 替换 `<img src>`）
- [x] ReaderView 完整阅读体验
- [x] 书签系统（`save_bookmark` / `get_bookmark`）
- [x] 阅读进度（`ReadingProgressRepo`）
- [x] 阅读样式持久化（`save_reader_style` / `get_reader_style`）
- [x] 书架页三 tab 过滤（全部/本地/网站）
- [x] 三种导入方式（文件对话框 / 路径 / URL）

### 待改进
- [ ] EPUB 元数据更丰富（出版社、ISBN、出版日期）
- [ ] 封面缓存优化（避免每次重读 base64）
- [ ] 大 EPUB 流式解析（当前全量加载到内存）
- [ ] TOC 层级保留（当前展平，丢失卷/部结构）
- [ ] EPUB 导出功能（修改后写回）
- [ ] 支持更多格式（TXT 已有 stub，PDF/MOBI 未实现）
- [ ] 阅读统计（阅读时长、速度、完成率）

---

## 下一步

- [ ] 实现 TOC 层级保留（卷 → 章 嵌套导航）
- [ ] 封面文件缓存（避免重复 base64 编码）
- [ ] 大文件流式章节加载（按需读取单个章节，不解析全书）
- [ ] TXT 格式支持完善
- [ ] PDF 格式支持（Path 3 新插件）
- [ ] EPUB DRM 移除支持（需评估法律风险）
