# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Yeader

Yeader is a cross-platform ebook reader (desktop/mobile/web) — a Rust + Tauri 2 port of [gedoor/legado](https://github.com/gedoor/legado). It parses legado-format book sources, RSS sources, replacement rules, and backup bundles. Licensed AGPL-3.0.

## Build & Development Commands

```bash
npm install                    # Install frontend deps + Tauri CLI
npm run tauri dev              # Launch desktop app with Vite dev server
npm run dev                    # Frontend-only dev server on :1420
npm run build                  # TypeScript check + Vite build
npm run tauri build            # Distributable desktop package

cargo check -p yeader          # Validate Rust changes
cargo test -p yeader           # Run Rust tests (Tauri crate)
cargo test --workspace         # Run all workspace tests
cargo test -p yeader-protocol  # Run tests for a single crate
cargo fmt --all                # Format all Rust code
```

Every change must pass `npm run build` and `cargo test --workspace` at minimum.

## Architecture

**Rust workspace** with 12 library crates + 1 Tauri app crate:

```
src-tauri/           Tauri 2 desktop shell — wires plugins, logging, Tauri commands
crates/
  yeader-models/     Domain types (LegacyBookSource, YeaderSource, FeedItem, etc.)
  yeader-protocol/   legado:// URI scheme parsing
  yeader-backup/     Load & parse legado backup dirs + zip archives
  yeader-library/    SQLite persistence (sources, subscriptions, books, progress)
  yeader-net/        HTTP client (reqwest, TLS fingerprint, impersonation)
  yeader-reader/     EPUB/TXT parsing + content pipeline (BookInfo, Chapter, TOC)
  yeader-rules/      Rule engine (CSS/JSONPath/XPath/Regex/Text/JS selectors)
  yeader-sdk/       Plugin runtime (SourcePlugin trait, HostApi interface)
  yeader-runtime/   Plugin registry + dispatch
  yeader-crypto/    AES-256-ECB, MD5, base64 utilities
  yeader-descramble/Image descrambling (vertical block stitching)
  yeader-http-util/ Request builder utilities
src/                 Vite + TypeScript frontend
```

### Source / Subscription 模型

**Source** = 内容获取模板（可复用）：
- JSON 标准源（RSS、书源、JS 脚本）
- 插件源（Wasm，完全自定义）

**Subscription** = 用户实例（状态独立）：
- 指定 scope（整个源 / 某个分类 / 某本书）
- 文件夹归属、启用状态、进度

```
~/.yeader/                    # 数据根目录
├── sources/                   # 源模板
│   ├── json/                  # JSON 标准源
│   └── plugins/               # Wasm 插件
├── subscriptions/             # 订阅实例
└── data/                      # 用户数据
```

### Key patterns

- **Source/Subscription 分离**: Source 是模板（可复用），Subscription 是用户实例（有独立状态和 scope）
- **Legado 兼容**: `yeader-models/src/legacy.rs` 定义 camelCase serde structs，额外字段通过 `#[serde(flatten)] extra: serde_json::Map` 保留
- **Rule engine**: `yeader-rules` 支持 CSS/JSONPath/XPath/Regex/Text/JavaScript 选择器，通过 `AnalyzeRule` 执行
- **Plugin system**: `yeader-sdk` 定义 `SourcePlugin` trait，`yeader-runtime` 实现插件注册和调度
- **Backup loading**: `yeader-backup` 支持目录和 zip 两种格式，自动检测
- **SQLite persistence**: `yeader-library` 使用 `rusqlite`，repos 使用 upsert with `ON CONFLICT DO UPDATE`
- **Tauri commands**: 在 `src-tauri/src/lib.rs` 通过 `#[tauri::command]` 暴露，commands 模块分离到 `src-tauri/src/commands/`
- **Test fixtures**: 位于 `fixtures/legado/`，通过 `include_str!()` 嵌入

### Page Structure

- `/sources` — 源管理（市场安装、源列表、enable/disable）
- `/feed` — 订阅页面（三栏布局：订阅列表 → 内容流 → 阅读视图）
- `/discover` — 发现（浏览分类、搜索、链接转换）
- `/reader/:bookId` — 阅读器视图

### YeaderHub

- 源市场数据来自 `YeaderHub` 仓库 (`Yeats33/YeaderHub`)
- `registry/sources.json` 索引所有可用源
- `sources/` 目录存放源 pack JSON

### Upstream reference

The upstream legado Kotlin source is cached at `.cache/legado-upstream/`. Key files for rule engine work:
- `app/src/main/java/io/legado/app/model/analyzeRule/` — AnalyzeRule, AnalyzeByJSoup, AnalyzeByJSonPath, AnalyzeByXPath, AnalyzeByRegex, AnalyzeUrl, RuleAnalyzer
- `app/src/main/java/io/legado/app/model/webBook/` — WebBook, BookList, BookInfo, BookChapterList, BookContent
- `app/src/main/java/io/legado/app/data/entities/rule/` — SearchRule, BookInfoRule, TocRule, ContentRule

### Implementation plan

See `docs/superpowers/plans/2026-04-18-legado-rust-rewrite.md` for the full 4-phase plan covering rule engine, HTTP client, content pipeline, and frontend UI.

## Coding Conventions

- **Rust**: Edition 2024, `cargo fmt` style (4-space indent), `snake_case` functions, `SCREAMING_SNAKE_CASE` constants
- **TypeScript**: Strict mode, 2-space indent, double-quoted imports, `camelCase` functions, `PascalCase` components
- Release profile uses LTO, single codegen unit, stripped binaries, panic=abort

## Tauri Configuration

- App ID: `cc.yeats.yeader`
- Window: 1200x800 default, 800x600 minimum
- CSP is currently null (testing) — must be restricted before production
- Review changes to `src-tauri/capabilities/default.json` and `src-tauri/tauri.conf.json` carefully — they affect the app's trust boundary

## Reference Links
-[legado Official on GitHub](https://github.com/gedoor/legado)
Relative PATH: [.cache/legado-official/](.cache/legado-official/)
-[a Useful Forked Legado Repository](https://github.com/Luoyacheng/legado)
Relative PATH: [.cache/legado-luoyacheng/](.cache/legado-luoyacheng/)

### Book Source Samples
sample
