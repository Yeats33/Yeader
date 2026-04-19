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

**Rust workspace** with 7 library crates + 1 Tauri app crate:

```
src-tauri/          Tauri 2 desktop shell — wires plugins, logging, Tauri commands
crates/
  yeader-models/    Shared domain types (LegacyBookSource, LegacyRssSource, etc.)
  yeader-protocol/  legado:// URI scheme parsing
  yeader-backup/    Load & parse legado backup dirs + zip archives
  yeader-library/   SQLite persistence (book_sources, rss_sources, replace_rules, reading_progress)
  yeader-net/       HTTP client utilities (stub)
  yeader-reader/    Reader session orchestration (stub)
  yeader-rules/     Rule parsing & execution engine (stub)
src/                Vite + TypeScript frontend (bootstrap stage)
```

### Dependency flow

```
src-tauri → yeader-protocol → yeader-models
yeader-backup → yeader-models + zip
yeader-library → yeader-models + rusqlite
yeader-reader → yeader-library, yeader-rules, yeader-models
yeader-rules, yeader-net → yeader-models
```

### Key patterns

- **Legado compatibility**: `yeader-models/src/legacy.rs` defines camelCase serde structs that match legado's JSON format exactly. Extra fields are preserved via `#[serde(flatten)] extra: serde_json::Map`.
- **Backup loading**: `yeader-backup` supports both extracted directories and `backup*.zip` archives. `load_backup(path)` auto-detects format. Nested zip directory prefixes are stripped. `load_backup_zip_reader(reader)` works on any `Read + Seek`.
- **SQLite persistence**: `yeader-library` uses `rusqlite` with `CREATE TABLE IF NOT EXISTS` migrations. Repos (`BookSourceRepo`, `RssSourceRepo`, `ReplaceRuleRepo`, `ReadingProgressRepo`) use upsert with `ON CONFLICT DO UPDATE`. Extra JSON fields round-trip through a TEXT column. Batch operations use `unchecked_transaction`. Use `Database::open_in_memory()` in tests.
- **Tauri commands**: Exposed in `src-tauri/src/lib.rs` via `#[tauri::command]` and registered in the `invoke_handler`. Currently only `parse_legado_import_uri`.
- **Test fixtures**: Located in `fixtures/legado/` and embedded at compile time with `include_str!()`. Covers book sources, RSS sources, replace rules, sample backup (dir + zip).

### EPUB Reader Features

- **Bookmark system**: Bookmarks saved to `mark.json` alongside each EPUB file via `save_bookmark`/`get_bookmark` Tauri commands
- **Three themes**: Light/dark/sepia modes via `ThemeManager` (`src/utils/themeManager.ts`) with CSS variable theming
- **Reader style persistence**: Font family, size, line height, theme saved to `config/reader_style.json` via `save_reader_style`/`get_reader_style` commands
- **Per-theme content styles**: EPUB content colors adapt to selected theme via `src/utils/bookContentThemes.ts`
- **Keyboard shortcuts**: `b` toggle bookmarks, `m` save bookmark, `t` toggle TOC, `s` toggle settings, `d` cycle theme

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
