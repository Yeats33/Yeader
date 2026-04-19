# EPUB Reader Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bookmark system, three-theme support (light/dark/sepia), font family selection, MD5 deduplication, cover extraction, and reader style persistence to the EPUB reader.

**Architecture:** 
- Rust: Add bookmark model/storage, MD5-based file deduplication, cover extraction to file system
- Frontend: Add bookmark panel, theme manager with CSS variables, font family picker, style persistence
- Tauri commands: bookmark CRUD, reader style CRUD, updated EPUB import with cover extraction

**Tech Stack:** Tauri 2, Rust (md5 crate, rusqlite), TypeScript, epubjs

---

## File Structure

```
src-tauri/src/commands/
  reader.rs           # Modify: add bookmark/style commands, fix log_dir->app_dir

src-tauri/src/
  model.rs            # Create: ReaderStyle, BookMark, Mark structs
  bookmark.rs         # Create: bookmark persistence (save/load JSON)
  style.rs            # Create: reader style persistence

crates/yeader-models/src/
  legacy.rs           # Modify: add ReaderStyle, BookMark, Mark types

src/
  pages/Reader.ts     # Modify: add bookmark panel, theme toggle, font picker, resize handler
  api.ts              # Modify: add bookmark/style API bindings
  types.ts            # Modify: add Bookmark, ReaderStyle interfaces
  utils/
    themeManager.ts   # Create: ThemeManager class with light/dark/sepia themes
    bookContentThemes.ts  # Create: per-theme EPUB content CSS

src/pages/
  Reader.css          # Create: reader styles with theme CSS variables
```

---

## Task 1: Add Rust Types for ReaderStyle and BookMark

**Files:**
- Modify: `crates/yeader-models/src/legacy.rs`

- [ ] **Step 1: Add ReaderStyle and Bookmark types to legacy.rs**

Find the end of the `LegacyBookSource` struct (around line 80) and add these types after it:

```rust
/// Reader style configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderStyle {
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
    pub theme: String,
}

impl Default for ReaderStyle {
    fn default() -> Self {
        ReaderStyle {
            font_family: "Noto Serif".to_string(),
            font_size: 18,
            line_height: 1.4,
            theme: "light".to_string(),
        }
    }
}

/// A single bookmark within a book
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mark {
    pub page: u32,
    pub content: String,
    pub width: u32,
    pub height: u32,
    pub cfi: String,
}

/// All bookmarks for a single book
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMark {
    pub book_path: String,
    pub list: Vec<Mark>,
}

impl BookMark {
    pub fn new(book_path: String) -> Self {
        BookMark {
            book_path,
            list: Vec::new(),
        }
    }

    /// Add or update a bookmark for a page
    pub fn add_mark(&mut self, page: u32, content: String, width: u32, height: u32, cfi: String) {
        if let Some(existing) = self.list.iter_mut().find(|m| m.page == page) {
            existing.content = content;
            existing.width = width;
            existing.height = height;
            existing.cfi = cfi;
        } else {
            self.list.push(Mark { page, content, width, height, cfi });
        }
    }

    /// Remove bookmark for a page
    pub fn remove_mark(&mut self, page: u32) {
        self.list.retain(|m| m.page != page);
    }
}
```

- [ ] **Step 2: Verify build**

Run: `cargo check -p yeader-models`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add crates/yeader-models/src/legacy.rs
git commit -m "feat(models): add ReaderStyle and BookMark types"
```

---

## Task 2: Add Bookmark Persistence in Rust

**Files:**
- Create: `src-tauri/src/bookmark.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create bookmark.rs**

```rust
use crate::model::BookMark;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri::Manager;

/// Save bookmark to JSON file alongside the EPUB
pub async fn save_bookmark_to_local_storage(bookmark: &BookMark) -> Result<String, String> {
    let book_path = &bookmark.book_path;
    let epub_dir = Path::new(book_path)
        .parent()
        .ok_or_else(|| "Failed to get parent directory from book path".to_string())?;

    let mark_file_path = epub_dir.join("mark.json");
    
    if !mark_file_path.exists() {
        fs::File::create(&mark_file_path)
            .map_err(|e| format!("Failed to create bookmark file: {}", e))?;
    }

    let json_data = serde_json::to_string(bookmark)
        .map_err(|e| format!("Failed to serialize bookmark: {}", e))?;
    
    fs::write(&mark_file_path, json_data)
        .map_err(|e| format!("Failed to write bookmark to file: {}", e))?;

    Ok(mark_file_path.to_string_lossy().to_string())
}

/// Load bookmark from JSON file alongside the EPUB
pub async fn load_bookmark_from_local_storage(book_path: &str) -> Result<BookMark, String> {
    let epub_dir = Path::new(book_path)
        .parent()
        .ok_or_else(|| "Failed to get parent directory from book path".to_string())?;

    let mark_file_path = epub_dir.join("mark.json");
    
    if !mark_file_path.exists() {
        return Ok(BookMark::new(book_path.to_string()));
    }

    let json_data = fs::read_to_string(&mark_file_path)
        .map_err(|e| format!("Failed to read bookmark file: {}", e))?;
    
    let bookmark: BookMark = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to deserialize bookmark: {}", e))?;
    
    Ok(bookmark)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p yeader`
Expected: No errors (ignore warnings about unused code)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/bookmark.rs
git commit -m "feat(reader): add bookmark persistence to local JSON"
```

---

## Task 3: Add Reader Style Persistence in Rust

**Files:**
- Create: `src-tauri/src/style.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create style.rs**

```rust
use crate::model::ReaderStyle;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

/// Save reader style to JSON config file
pub async fn save_style_to_local_storage(
    app_handle: &AppHandle,
    style: &ReaderStyle,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to get app data directory: {}", e))?;

    let config_dir = app_dir.join("config");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let style_file_path = config_dir.join("reader_style.json");
    let json_data = serde_json::to_string(style)
        .map_err(|e| format!("Failed to serialize style: {}", e))?;

    fs::write(&style_file_path, json_data)
        .map_err(|e| format!("Failed to write style to file: {}", e))?;

    Ok(style_file_path.to_string_lossy().to_string())
}

/// Load reader style from JSON config file
pub async fn load_style_from_local_storage(app_handle: &AppHandle) -> Result<ReaderStyle, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to get app data directory: {}", e))?;

    let style_file_path = app_dir.join("config").join("reader_style.json");

    if !style_file_path.exists() {
        return Ok(ReaderStyle::default());
    }

    let json_data = fs::read_to_string(&style_file_path)
        .map_err(|e| format!("Failed to read style file: {}", e))?;

    let style: ReaderStyle = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to deserialize style: {}", e))?;

    Ok(style)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p yeader`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/style.rs
git commit -m "feat(reader): add reader style persistence to config"
```

---

## Task 4: Add Bookmark and Style Tauri Commands

**Files:**
- Modify: `src-tauri/src/lib.rs` (add module declarations and commands)
- Modify: `src-tauri/src/commands/reader.rs`

- [ ] **Step 1: Add module declarations to lib.rs**

Find the `mod commands;` line and add:

```rust
mod bookmark;
mod style;
```

Find the `use commands::reader::*;` line and add:

```rust
use bookmark::{load_bookmark_from_local_storage, save_bookmark_to_local_storage};
use model::{BookMark, ReaderStyle};
use style::{load_style_from_local_storage, save_style_to_local_storage};
```

- [ ] **Step 2: Add bookmark commands to reader.rs**

Find the `get_epub_toc` command (around line 316) and add these commands AFTER it:

```rust
#[tauri::command]
pub async fn save_reader_style(
    app_handle: AppHandle,
    font_family: String,
    font_size: u32,
    line_height: f32,
    theme: String,
) -> Result<String, String> {
    let style = ReaderStyle {
        font_family,
        font_size,
        line_height,
        theme,
    };
    save_style_to_local_storage(&app_handle, &style).await
}

#[tauri::command]
pub async fn get_reader_style(app_handle: AppHandle) -> Result<ReaderStyle, String> {
    load_style_from_local_storage(&app_handle).await
}

#[tauri::command]
pub async fn save_bookmark(
    book_path: String,
    page: u32,
    content: String,
    width: u32,
    height: u32,
    cfi: String,
    action: Option<u32>,
) -> Result<String, String> {
    let mut bookmark = match load_bookmark_from_local_storage(&book_path).await {
        Ok(bm) => bm,
        Err(_) => BookMark::new(book_path.clone()),
    };

    match action {
        Some(1) => {
            bookmark.remove_mark(page);
        }
        _ => {
            bookmark.add_mark(page, content, width, height, cfi);
        }
    }

    save_bookmark_to_local_storage(&bookmark).await
}

#[tauri::command]
pub async fn get_bookmark(book_path: String) -> Result<BookMark, String> {
    load_bookmark_from_local_storage(&book_path).await
}
```

- [ ] **Step 3: Register new commands in lib.rs**

Find the `invoke_handler` section and add:

```rust
save_reader_style,
get_reader_style,
save_bookmark,
get_bookmark,
```

- [ ] **Step 4: Fix path bug - change log_dir to app_dir**

In `import_epub` function (around line 153), change:
```rust
let book_dir = state.log_dir.join("epub_library").join(&book_id);
```
to:
```rust
let app_dir = state.app_dir.clone();
let book_dir = app_dir.join("epub_library").join(&book_id);
```

- [ ] **Step 5: Verify build**

Run: `cargo check -p yeader`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/reader.rs
git commit -m "feat(reader): add bookmark and style Tauri commands"
```

---

## Task 5: Add TypeScript Types and API Bindings

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`

- [ ] **Step 1: Add types to types.ts**

Add at the end of the file:

```typescript
export interface ReaderStyle {
  font_family: string;
  font_size: number;
  line_height: number;
  theme: string;
}

export interface Mark {
  page: number;
  content: string;
  width: number;
  height: number;
  cfi: string;
}

export interface BookMark {
  book_path: string;
  list: Mark[];
}
```

- [ ] **Step 2: Add API functions to api.ts**

Add at the end of the file (before the closing export if any):

```typescript
export async function saveReaderStyle(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  theme: string,
): Promise<string> {
  return await invokeAdapter<string>("save_reader_style", {
    fontFamily,
    fontSize,
    lineHeight,
    theme,
  });
}

export async function getReaderStyle(): Promise<ReaderStyle> {
  return await invokeAdapter<ReaderStyle>("get_reader_style");
}

export async function saveBookmark(
  bookPath: string,
  page: number,
  content: string,
  width: number,
  height: number,
  cfi: string,
  action?: number,
): Promise<string> {
  return await invokeAdapter<string>("save_bookmark", {
    bookPath,
    page,
    content,
    width,
    height,
    cfi,
    action,
  });
}

export async function getBookmark(bookPath: string): Promise<BookMark> {
  return await invokeAdapter<BookMark>("get_bookmark", { bookPath });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/api.ts
git commit -m "feat(api): add bookmark and reader style bindings"
```

---

## Task 6: Create ThemeManager Utility

**Files:**
- Create: `src/utils/themeManager.ts`

- [ ] **Step 1: Create themeManager.ts**

```typescript
export type Theme = "light" | "dark" | "sepia";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
}

export interface ThemeConfig {
  key: Theme;
  label: string;
  colors: ThemeColors;
}

export const THEME_CONFIGS: ThemeConfig[] = [
  {
    key: "light",
    label: "浅色模式",
    colors: {
      background: "#ffffff",
      surface: "#f5f5f5",
      text: "#303133",
      textSecondary: "#606266",
      border: "#e0e0e0",
      accent: "#409eff",
    },
  },
  {
    key: "dark",
    label: "深色模式",
    colors: {
      background: "#1a1a1a",
      surface: "#2c2c2c",
      text: "#e5e5e5",
      textSecondary: "#b3b3b3",
      border: "#404040",
      accent: "#66b1ff",
    },
  },
  {
    key: "sepia",
    label: "护眼模式",
    colors: {
      background: "#f4f1ea",
      surface: "#ebe5d6",
      text: "#4a4a3a",
      textSecondary: "#6a6a5a",
      border: "#d4c5a9",
      accent: "#8b7355",
    },
  },
];

export class ThemeManager {
  private currentTheme: Theme = "light";

  constructor() {
    this.loadThemeFromStorage();
  }

  private loadThemeFromStorage() {
    try {
      const saved = localStorage.getItem("app-theme");
      if (saved && this.isValidTheme(saved)) {
        this.currentTheme = saved as Theme;
      }
    } catch {}
  }

  private isValidTheme(theme: string): theme is Theme {
    return THEME_CONFIGS.some((c) => c.key === theme);
  }

  public getAvailableThemes(): ThemeConfig[] {
    return THEME_CONFIGS;
  }

  public getThemeConfig(theme?: Theme): ThemeConfig {
    const target = theme || this.currentTheme;
    return THEME_CONFIGS.find((c) => c.key === target) || THEME_CONFIGS[0];
  }

  public getNextTheme(): Theme {
    const themes = THEME_CONFIGS.map((c) => c.key);
    const idx = themes.indexOf(this.currentTheme);
    return themes[(idx + 1) % themes.length];
  }

  public toggleToNextTheme(): Theme {
    const next = this.getNextTheme();
    this.setTheme(next);
    return next;
  }

  public setTheme(theme: Theme) {
    this.currentTheme = theme;
    this.applyTheme(theme);
    localStorage.setItem("app-theme", theme);
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme } }));
  }

  public getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  private applyTheme(theme: Theme) {
    const colors = this.getThemeConfig(theme).colors;
    const root = document.documentElement;

    root.style.setProperty("--app-background", colors.background);
    root.style.setProperty("--app-surface", colors.surface);
    root.style.setProperty("--app-text-color", colors.text);
    root.style.setProperty("--app-text-secondary", colors.textSecondary);
    root.style.setProperty("--app-border", colors.border);
    root.style.setProperty("--app-accent", colors.accent);

    document.body.className = document.body.className.replace(/theme-\w+/g, "");
    document.body.classList.add(`theme-${theme}`);
  }

  public initializeTheme() {
    this.applyTheme(this.currentTheme);
  }
}

export const themeManager = new ThemeManager();
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/themeManager.ts
git commit -m "feat(reader): add ThemeManager with light/dark/sepia themes"
```

---

## Task 7: Create bookContentThemes Utility

**Files:**
- Create: `src/utils/bookContentThemes.ts`

- [ ] **Step 1: Create bookContentThemes.ts**

```typescript
import type { Theme } from "./themeManager";

interface ContentTheme {
  body: Record<string, string>;
  p: Record<string, string>;
  h1: Record<string, string>;
  h2: Record<string, string>;
  h3: Record<string, string>;
  "*": Record<string, string>;
}

const contentThemes: Record<Theme, ContentTheme> = {
  light: {
    body: { "background-color": "#ffffff", color: "#303133" },
    p: { "color": "#303133" },
    h1: { "color": "#1a1a1a" },
    h2: { "color": "#2a2a2a" },
    h3: { "color": "#3a3a3a" },
    "*": { "background-color": "transparent" },
  },
  dark: {
    body: { "background-color": "#1a1a1a", color: "#e5e5e5" },
    p: { "color": "#e5e5e5" },
    h1: { "color": "#ffffff" },
    h2: { "color": "#f0f0f0" },
    h3: { "color": "#d0d0d0" },
    "*": { "background-color": "transparent" },
  },
  sepia: {
    body: { "background-color": "#f4f1ea", color: "#4a4a3a" },
    p: { "color": "#4a4a3a" },
    h1: { "color": "#3a3a2a" },
    h2: { "color": "#4a4a3a" },
    h3: { "color": "#5a5a4a" },
    "*": { "background-color": "transparent" },
  },
};

export function getBookContentTheme(theme: Theme): ContentTheme {
  return contentThemes[theme];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/bookContentThemes.ts
git commit -m "feat(reader): add per-theme content styles for EPUB"
```

---

## Task 8: Update Reader Page with Enhanced UI

**Files:**
- Create: `src/pages/Reader.css`
- Modify: `src/pages/Reader.ts`

- [ ] **Step 1: Create Reader.css with theme variables**

```css
.page-reader {
  --font-size: 18px;
  --line-height: 1.6;
  --app-background: #ffffff;
  --app-surface: #f5f5f5;
  --app-text-color: #303133;
  --app-text-secondary: #606266;
  --app-border: #e0e0e0;
  --app-accent: #409eff;

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--app-background);
  color: var(--app-text-color);
  font-family: var(--font-family, "Noto Serif", serif);
  font-size: var(--font-size);
  line-height: var(--line-height);
  outline: none;
}

.page-reader.theme-light { background: #ffffff; color: #303133; }
.page-reader.theme-dark { background: #1a1a1a; color: #e5e5e5; }
.page-reader.theme-sepia { background: #f4f1ea; color: #4a4a3a; }

.reader-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
}

.reader-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-icon {
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--app-text-secondary);
  cursor: pointer;
  font-size: 18px;
}

.btn-icon:hover {
  background: var(--app-border);
  color: var(--app-accent);
}

.reader-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.chapter-content {
  max-width: 800px;
  margin: 0 auto;
  font-size: var(--font-size);
  line-height: var(--line-height);
}

.chapter-content h1, .chapter-content h2, .chapter-content h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.reader-toc {
  position: fixed;
  top: 60px;
  right: 0;
  bottom: 60px;
  width: 300px;
  background: var(--app-background);
  border-left: 1px solid var(--app-border);
  box-shadow: -2px 0 10px rgba(0,0,0,0.1);
  overflow-y: auto;
  padding: 16px;
  z-index: 100;
}

.reader-toc.hidden { display: none; }

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-item {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--app-text-secondary);
}

.toc-item:hover {
  background: var(--app-surface);
  color: var(--app-accent);
}

.toc-item.active {
  background: var(--app-accent);
  color: white;
}

.reader-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 12px;
  background: var(--app-surface);
  border-top: 1px solid var(--app-border);
}

.ctrl-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text-color);
  cursor: pointer;
}

.ctrl-btn:hover:not(:disabled) {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.ctrl-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chapter-indicator {
  color: var(--app-text-secondary);
  font-size: 14px;
}

.reader-settings-panel {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 280px;
  background: var(--app-background);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 16px;
  z-index: 100;
}

.reader-settings-panel.hidden { display: none; }

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.setting-row label {
  width: 50px;
  color: var(--app-text-secondary);
  font-size: 14px;
}

.setting-row input[type="range"] {
  flex: 1;
}

.setting-row span {
  width: 40px;
  text-align: right;
  font-size: 14px;
  color: var(--app-text-color);
}

.btn-toggle {
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-color);
  cursor: pointer;
}

.btn-toggle.active {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: white;
}

.theme-selector {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.theme-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
}

.theme-btn.active {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: white;
}

.font-selector {
  margin-top: 12px;
}

.font-selector select {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-background);
  color: var(--app-text-color);
}
```

- [ ] **Step 2: Commit partial CSS**

```bash
git add src/pages/Reader.css
git commit -m "feat(reader): add Reader.css with theme variables"
```

---

## Task 9: Rewrite Reader.ts with Enhanced Features

**Files:**
- Modify: `src/pages/Reader.ts`

- [ ] **Step 1: Replace the entire Reader.ts content**

The new Reader.ts should:
1. Add bookmark panel toggle and functionality
2. Add theme switching (light/dark/sepia)
3. Add font family selector
4. Add reader style persistence (load on mount, save on change)
5. Add bookmark save/load
6. Improve keyboard shortcuts
7. Track current page/chapter from content

```typescript
// Key imports to add:
import { themeManager } from "../utils/themeManager";
import { getBookContentTheme } from "../utils/bookContentThemes";
import {
  saveReaderStyle, getReaderStyle,
  saveBookmark, getBookmark,
} from "../api.ts";

// Key state additions:
interface ReaderState {
  // ... existing fields
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  showToc: boolean;
  showSettings: boolean;
  showBookmarks: boolean;
  bookmarks: Array<{page: number, content: string, cfi: string}>;
  currentCfi: string;
}

// Key new functions needed:
- loadReaderStyle() - load from backend on mount
- saveReaderStyle() - save to backend on change
- toggleTheme() - cycle through light/dark/sepia
- toggleBookmarks() - show/hide bookmark panel
- saveCurrentBookmark() - save current position as bookmark
- loadBookmarks() - load bookmarks from backend
- applyReaderStyle() - apply font/theme to content
```

Due to length, the full implementation will be done by the executor. Key points:
- Use `themeManager.setTheme(theme)` and `themeManager.getCurrentTheme()`
- Call `getReaderStyle()` on mount, `saveReaderStyle()` on setting change
- Call `getBookmark(bookUrl)` on mount
- Display bookmarks in a panel with delete option
- Apply content theme colors via epubjs themes API

- [ ] **Step 2: Commit**

```bash
git add src/pages/Reader.ts
git commit -m "feat(reader): add bookmark panel, theme switcher, font picker"
```

---

## Task 10: Verify Build

- [ ] **Step 1: Run TypeScript check**

Run: `npm run build` (or `npx tsc --noEmit` if available)
Expected: No TypeScript errors

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass

- [ ] **Step 3: Test manually** (not automated)

Run: `npm run tauri dev`
Expected: EPUB reader loads with theme toggle, bookmark panel, and font picker

---

## Task 11: Update CLAUDE.md

- [ ] **Step 1: Document new features**

Add to the "Key patterns" section in CLAUDE.md:

```markdown
### EPUB Reader Features
- Bookmark system: saves to `mark.json` alongside EPUB file
- Three themes: light/dark/sepia via ThemeManager
- Reader style persistence: `config/reader_style.json`
- MD5-based deduplication for imported EPUBs
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document EPUB reader features"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Rust types for ReaderStyle/BookMark | `crates/yeader-models/src/legacy.rs` |
| 2 | Bookmark persistence | `src-tauri/src/bookmark.rs` |
| 3 | Style persistence | `src-tauri/src/style.rs` |
| 4 | Tauri commands | `src-tauri/src/lib.rs`, `commands/reader.rs` |
| 5 | TypeScript types & API | `src/types.ts`, `src/api.ts` |
| 6 | ThemeManager | `src/utils/themeManager.ts` |
| 7 | Content themes | `src/utils/bookContentThemes.ts` |
| 8 | Reader CSS | `src/pages/Reader.css` |
| 9 | Reader page rewrite | `src/pages/Reader.ts` |
| 10 | Verify build | - |
| 11 | Update docs | `CLAUDE.md` |
