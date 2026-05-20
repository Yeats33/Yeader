# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the Vite + TypeScript frontend. `src/main.tsx` mounts the React shell, `src/App.tsx` owns top-level routing, and older imperative HTML pages are hosted through `src/legacy/LegacyPage.tsx` while they are migrated incrementally. Current React pages include account, integration, SoNovel config/rules, and settings; bookshelf and reader still use the legacy render/init pattern. Shared hash-route helpers live in `src/routing/`; shared styles start at `src/styles/index.css`. Reader UI modules live under `src/pages/Reader/`; keep reader rendering, handlers, style, chapter loading, and bookmark helpers split by their existing files. `src-tauri/src/` contains the Rust/Tauri host code: `main.rs` boots the app and `lib.rs` wires plugins, logging, and setup. Keep desktop permissions in `src-tauri/capabilities/`, bundle icons in `src-tauri/icons/`, and app metadata/build hooks in `src-tauri/tauri.conf.json`. The root `Cargo.toml` defines the workspace; `package.json` owns frontend scripts.

The `crates/` directory holds the core Rust library crates:
- `yeader-models` — Shared domain types and legado format parsers. All legado JSON structures use `#[serde(rename_all = "camelCase")]` and preserve unknown fields via `#[serde(flatten)] extra: serde_json::Map`.
- `yeader-protocol` — `legado://` URI scheme parsing with percent-decoding.
- `yeader-backup` — Loads legado backups from extracted directories or `backup*.zip` archives. Use `load_backup(path)` for auto-detection.
- `yeader-library` — SQLite persistence via `rusqlite`. Tables include `book_sources`, `rss_sources`, `replace_rules`, `reading_progress`, `books`, `book_groups`, `bookmarks`, auth sessions, and native `yeader_sources`. Repos use upsert (`ON CONFLICT DO UPDATE`) where appropriate, batch operations use transactions, and extra fields round-trip as JSON TEXT columns. `BookRepo` joins `reading_progress` so bookshelf API responses can show the 1-based current chapter and chapter title. Bookmark persistence uses the shared `bookmarks` table keyed by `book_url`, `chapter_index`, and `offset`; do not reintroduce per-EPUB JSON bookmark files. Use `Database::open_in_memory()` in tests.
- `yeader-net` — HTTP client utilities (stub, pending `reqwest` + `tokio` implementation).
- `yeader-rules` — Rule parsing and execution engine (stub, pending CSS/JSONPath/regex implementation).
- `yeader-reader` — Reader parsing and orchestration helpers for EPUB/TXT and pipeline integration.

The upstream legado Kotlin source is cached at `.cache/legado-upstream/` for reference. Key directories: `model/analyzeRule/`, `model/webBook/`, `data/entities/rule/`.

## Build, Test, and Development Commands
- `npm install` installs frontend dependencies and the Tauri CLI.
- `npm run dev` starts the web UI on `http://localhost:1420`.
- `npm test` runs the Node-based TypeScript frontend tests.
- `npm run tauri dev` launches the desktop shell and Vite together via Tauri's dev hooks.
- `npm run build` runs `tsc` and produces the frontend bundle in `dist/`.
- `npm run tauri build` builds a distributable desktop package.
- `cargo check -p yeader` validates Rust changes from the repo root.
- `cargo test --workspace` runs the full Rust test suite across all crates.
- `cargo test -p yeader-backup` runs tests for a single crate (replace crate name as needed).
- `cargo fmt --all` formats Rust code before review.

Every code change must pass `npm run build`, `npm test`, and `cargo test --workspace`.

## Coding Style & Naming Conventions
TypeScript is compiled with `strict`, `noUnusedLocals`, and `noUnusedParameters`; keep browser code typed and minimal. Match the existing frontend style: 2-space indentation, double-quoted imports, `camelCase` for functions/variables, and `PascalCase` for React components. Rust uses edition 2024 and should follow `cargo fmt`: 4-space indentation, `snake_case` for functions/modules, and `SCREAMING_SNAKE_CASE` for constants.

## Testing Guidelines
Every code change should pass `npm run build`, `npm test`, and `cargo test --workspace`. Add Rust unit tests beside the code they cover (inline `#[cfg(test)] mod tests`) or integration tests under `src-tauri/tests/`. Test fixtures live in `fixtures/legado/` and are embedded at compile time with `include_str!()`. Frontend tests currently run with `node --test --experimental-strip-types` over `src/**/*.test.ts`; keep browser-independent logic testable there, and add or update the runner in `package.json` if the frontend test shape changes.

## Commit & Pull Request Guidelines
Use short imperative commit subjects prefixed with a type: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Keep pull requests narrow and include: the purpose of the change, affected areas, local verification commands, linked issues, and screenshots for UI or window changes. Call out any edits to `src-tauri/capabilities/default.json` or `src-tauri/tauri.conf.json` explicitly.
When restoring or rescuing interrupted work, prefer multiple small commits over one large commit so partially recovered functionality is not lost again.
After completing and verifying requested repository changes, commit and push the current branch automatically unless the user explicitly says not to, the operation would be destructive, or required credentials/remote access are unavailable.

## Security & Configuration Tips
Do not commit `.env`, `dist/`, `target/`, `.cache/`, logs, or platform build artifacts. Review shell plugin, capability, and Tauri config changes carefully; widening them changes the app's trust boundary.
