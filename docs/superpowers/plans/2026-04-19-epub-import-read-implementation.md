# EPUB Import & Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement local EPUB file import and reading via the bookshelf page.

**Architecture:** EPUB files stored in `app_data/epub_library/`, metadata in SQLite `books` table. Local books identified by `source_url = "local://epub"`. Reuse existing `epub.rs` parser and reader UI.

**Tech Stack:** Rust (tauri, zip crate), TypeScript, SQLite via existing `yeader-library` crate.

---

## File Map

```
crates/yeader-reader/src/lib.rs       - Add epub module export
crates/yeader-reader/src/epub.rs      - Already exists, needs minor fixes
src-tauri/src/commands/reader.rs     - Add import_epub, read_local_epub, list_local_epubs, delete_local_epub
src-tauri/src/lib.rs                 - Register new commands
src/api.ts                           - Add importEpub, listLocalEpubs, readLocalEpub, deleteLocalEpub
src/pages/Bookshelf.ts               - Add local books tab + import button
src/pages/Reader.ts                  - Handle local epub reading
```

---

## Task 1: Fix epub.rs typos and export epub module

**Files:**
- Modify: `crates/yeader-reader/src/lib.rs:1-9`
- Modify: `crates/yeader-reader/src/epub.rs:277`

- [ ] **Step 1: Add epub module to lib.rs**

```rust
//! Reader orchestration will live here.

pub mod pipeline;
pub mod txt;
pub mod epub;  // ADD THIS LINE

use yeader_models::ReadingProgress;

pub use pipeline::{BookInfo, Chapter, fetch_book_info, fetch_toc, fetch_content};
```

- [ ] **Step 2: Fix typo in parse_manifest function**

In `epub.rs` line 277, `opfml` should be `opf_xml`:

```rust
// WRONG:
let chunk = &opffml[search_pos..];

// CORRECT:
let chunk = &opf_xml[search_pos..];
```

- [ ] **Step 3: Verify build**

Run: `cargo check -p yeader-reader`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add crates/yeader-reader/src/lib.rs crates/yeader-reader/src/epub.rs
git commit -m "fix(epub): add module export and fix typo in parse_manifest"
```

---

## Task 2: Add Tauri commands for EPUB operations

**Files:**
- Modify: `src-tauri/src/commands/reader.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add new Tauri commands to reader.rs**

Add these functions after the existing `fetch_content` function:

```rust
#[tauri::command]
pub async fn import_epub(
    state: State<'_, AppState>,
    path: String,
) -> Result<yeader_models::Book, String> {
    use std::path::Path;
    use yeader_reader::epub::{read_epub, EpubBook};
    use uuid::Uuid;

    // Validate file exists
    let source_path = Path::new(&path);
    if !source_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Create epub_library directory
    let app_dir = state.app_dir.lock().unwrap().clone();
    let epub_lib_dir = app_dir.join("epub_library");
    std::fs::create_dir_all(&epub_lib_dir).map_err(|e| e.to_string())?;

    // Read and parse EPUB
    let epub_book = read_epub(source_path).map_err(|e| format!("Failed to parse EPUB: {}", e))?;

    // Generate unique ID and copy file
    let book_id = Uuid::new_v4().to_string();
    let epub_file_name = format!("{}.epub", book_id);
    let dest_path = epub_lib_dir.join(&epub_file_name);
    std::fs::copy(&path, &dest_path).map_err(|e| format!("Failed to copy EPUB: {}", e))?;

    // Create Book record
    let book = yeader_models::Book {
        url: format!("local://epub/{}", book_id),
        name: epub_book.title,
        author: epub_book.author,
        cover_url: None, // TODO: extract cover
        source_url: "local://epub".to_string(),
        toc_url: None,
        last_read_at: Some(chrono::Utc::now().to_rfc3339()),
        group_id: None,
        book_type: Some("epub".to_string()),
        intro: None,
        extra: {
            let mut map = serde_json::Map::new();
            map.insert("epub_path".to_string(), serde_json::json!(dest_path.to_string_lossy().to_string()));
            map.insert("chapter_count".to_string(), serde_json::json!(epub_book.chapters.len()));
            map
        },
    };

    // Save to database
    {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.upsert(&book).map_err(|e| e.to_string())?;
    }

    Ok(book)
}

#[tauri::command]
pub async fn list_local_epubs(
    state: State<'_, AppState>,
) -> Result<Vec<yeader_models::Book>, String> {
    let db = state.db.lock().unwrap();
    let repo = yeader_library::BookRepo::new(&db);
    let all_books = repo.list_all().map_err(|e| e.to_string())?;
    Ok(all_books.into_iter().filter(|b| b.source_url == "local://epub").collect())
}

#[tauri::command]
pub async fn read_local_epub(
    state: State<'_, AppState>,
    book_url: String,
    chapter_index: usize,
) -> Result<String, String> {
    use yeader_reader::epub::read_epub;

    // Extract book_id from URL
    let book_id = book_url.strip_prefix("local://epub/").ok_or("Invalid book URL")?;

    // Find book in database
    let book = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.find_by_url(&book_url).map_err(|e| e.to_string())?
            .ok_or("Book not found")?
    };

    // Get epub path from extra
    let epub_path = book.extra.get("epub_path")
        .and_then(|v| v.as_str())
        .ok_or("EPUB path not found in book metadata")?;

    // Read EPUB
    let epub_book = read_epub(std::path::Path::new(epub_path))
        .map_err(|e| format!("Failed to read EPUB: {}", e))?;

    // Return chapter content
    epub_book.chapters.get(chapter_index)
        .map(|ch| ch.content.clone())
        .ok_or_else(|| format!("Chapter {} not found", chapter_index))
}

#[tauri::command]
pub async fn delete_local_epub(
    state: State<'_, AppState>,
    book_url: String,
) -> Result<bool, String> {
    // Find book
    let book = {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.find_by_url(&book_url).map_err(|e| e.to_string())?
            .ok_or("Book not found")?
    };

    // Delete EPUB file
    if let Some(epub_path) = book.extra.get("epub_path").and_then(|v| v.as_str()) {
        let _ = std::fs::remove_file(epub_path);
    }

    // Delete from database
    {
        let db = state.db.lock().unwrap();
        let repo = yeader_library::BookRepo::new(&db);
        repo.delete(&book_url).map_err(|e| e.to_string())?;
    }

    Ok(true)
}
```

- [ ] **Step 2: Register commands in lib.rs**

Add to the `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    reader::import_epub,
    reader::list_local_epubs,
    reader::read_local_epub,
    reader::delete_local_epub,
])
```

- [ ] **Step 3: Add uuid and chrono to src-tauri/Cargo.toml**

Check if `uuid` and `chrono` are already dependencies. If not, add them:

```toml
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
```

- [ ] **Step 4: Verify build**

Run: `cargo check -p yeader`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/reader.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add Tauri commands for EPUB import and local reading"
```

---

## Task 3: Add TypeScript API functions

**Files:**
- Modify: `src/api.ts:1-228`

- [ ] **Step 1: Add new API functions to api.ts**

Add these after the existing `saveReadingProgress` function (around line 204):

```typescript
export async function importEpub(path: string): Promise<Book> {
  return await invokeAdapter<Book>("import_epub", { path });
}

export async function listLocalEpubs(): Promise<Book[]> {
  return await invokeAdapter<Book[]>("list_local_epubs");
}

export async function readLocalEpub(
  bookUrl: string,
  chapterIndex: number,
): Promise<string> {
  return await invokeAdapter<string>("read_local_epub", {
    bookUrl,
    chapterIndex,
  });
}

export async function deleteLocalEpub(bookUrl: string): Promise<boolean> {
  return await invokeAdapter<boolean>("delete_local_epub", { bookUrl });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): add EPUB import and local reading API functions"
```

---

## Task 4: Update Bookshelf page with local books tab

**Files:**
- Modify: `src/pages/Bookshelf.ts`

- [ ] **Step 1: Add local books tab to renderBookshelfPage**

Change the `renderBookshelfPage` function to include a tab filter and import button:

```typescript
export async function renderBookshelfPage(): Promise<string> {
  let books: Book[] = [];
  try {
    books = await listBooks();
  } catch {
    books = [];
  }

  // Separate local epubs
  const localBooks = books.filter(b => b.source_url === "local://epub");
  const networkBooks = books.filter(b => b.source_url !== "local://epub");

  return `
    <div class="page page-bookshelf" data-view-mode="grid" data-filter="all">
      <header class="page-header">
        <h1>书架</h1>
        <div class="view-toggle">
          <button class="btn-toggle active" data-view="grid" title="网格视图">&#x1F5BC;</button>
          <button class="btn-toggle" data-view="list" title="列表视图">&#x2630;</button>
        </div>
        <button class="btn-icon" data-nav="/search" title="搜索">&#x1F50D;</button>
        <button class="btn-icon" data-nav="/settings" title="设置">&#x2699;</button>
      </header>

      <div class="shelf-tabs">
        <button class="tab-btn active" data-filter="all">全部 (${books.length})</button>
        <button class="tab-btn" data-filter="local">本地书籍 (${localBooks.length})</button>
        <button class="tab-btn" data-filter="network">网络书籍 (${networkBooks.length})</button>
      </div>

      <button class="btn-primary" id="import-epub-btn" title="导入EPUB">+ 导入EPUB</button>

      ${books.length === 0 ? `
        <div class="empty-state">
          <p>书架为空</p>
          <button class="btn-primary" data-nav="/search">去搜索书籍</button>
        </div>
      ` : `
        <div id="book-container" data-view="grid">
          ${describeBookCards(books, "grid")}
        </div>
      `}
    </div>
  `;
}
```

- [ ] **Step 2: Add tab filtering and import handler to initBookshelfHandlers**

Add this before the view toggle handling:

```typescript
export function initBookshelfHandlers(container: HTMLElement) {
  // Tab filtering
  const tabBtns = container.querySelectorAll<HTMLButtonElement>(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filter = btn.dataset.filter!;
      const pageEl = container.querySelector<HTMLElement>(".page-bookshelf");
      if (pageEl) pageEl.dataset.filter = filter;

      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const allBooks = await listBooks().catch(() => [] as Book[]);
      let filteredBooks = allBooks;
      if (filter === "local") {
        filteredBooks = allBooks.filter(b => b.source_url === "local://epub");
      } else if (filter === "network") {
        filteredBooks = allBooks.filter(b => b.source_url !== "local://epub");
      }

      const bookContainer = container.querySelector<HTMLElement>("#book-container");
      if (bookContainer) {
        bookContainer.innerHTML = describeBookCards(filteredBooks, "grid");
      }

      attachBookHandlers(container);
      attachDeleteHandlers(container);
    });
  });

  // EPUB Import
  const importBtn = container.querySelector<HTMLButtonElement>("#import-epub-btn");
  importBtn?.addEventListener("click", async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (selected) {
        const book = await importEpub(selected as string);
        alert(`导入成功: ${book.name}`);
        // Refresh the list
        window.location.reload();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`导入失败: ${msg}`);
    }
  });

  // View toggle
  // ... rest of existing code ...
}
```

- [ ] **Step 3: Update attachDeleteHandlers to handle local epub deletion**

For local epubs, use `deleteLocalEpub` instead of `removeBook`:

```typescript
function attachDeleteHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>("[data-delete-book]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (btn.disabled) return;
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = "⏳";

      const bookUrl = btn.dataset.deleteBook!;
      const bookItem = btn.closest<HTMLElement>("[data-book-url]");
      const bookName = bookItem?.dataset.bookName || "此书";
      const isLocal = bookUrl.startsWith("local://epub/");

      try {
        const userConfirmed = await ask(`确定要从书架删除《${bookName}》吗？`, {
          title: "确认删除",
          kind: "warning",
          okLabel: "删除",
          cancelLabel: "取消"
        });

        if (!userConfirmed) {
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        let success = false;
        if (isLocal) {
          success = await deleteLocalEpub(bookUrl);
        } else {
          success = await removeBook(bookUrl);
        }

        if (success) {
          bookItem?.remove();
        } else {
          alert("删除失败");
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`删除失败：${msg}`);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Bookshelf.ts
git commit -m "feat(bookshelf): add local books tab and EPUB import button"
```

---

## Task 5: Update Reader page for local EPUB support

**Files:**
- Modify: `src/pages/Reader.ts`

- [ ] **Step 1: Detect local epub and use local reading**

Modify `renderReaderPage` to detect local epubs:

```typescript
export async function renderReaderPage(bookUrl: string): Promise<string> {
  state.bookUrl = decodeURIComponent(bookUrl);
  state.sourceUrl = "";
  state.currentChapterIndex = 0;
  state.bookInfo = null;
  state.chapters = [];

  const isLocalEpub = state.bookUrl.startsWith("local://epub/");

  // Look up the book from library to get source_url
  try {
    const book = await getBook(state.bookUrl);
    if (book) {
      state.sourceUrl = book.source_url;
    }
  } catch (e) {
    console.error("[Reader] getBook failed:", e);
  }

  const savedProgress = await getReadingProgress(state.bookUrl);
  if (savedProgress) {
    state.currentChapterIndex = savedProgress.chapter_index;
  }

  if (isLocalEpub) {
    // Load local epub chapters
    try {
      const books = await listLocalEpubs();
      const book = books.find(b => b.url === state.bookUrl);
      if (book && book.extra) {
        // Build chapters from epub metadata stored in extra
        const chapterCount = book.extra.chapter_count || 0;
        state.chapters = Array.from({ length: chapterCount }, (_, i) => ({
          title: `Chapter ${i + 1}`,
          url: String(i),
          is_volume: false,
          is_vip: false,
        }));
        state.bookInfo = {
          name: book.name,
          author: book.author,
        };
      }
    } catch (e) {
      console.error("[Reader] listLocalEpubs failed:", e);
    }
  } else {
    // Network book - existing logic
    let bookInfo: BookInfo = { name: "", author: "" };
    try {
      bookInfo = await fetchBookInfo(state.bookUrl, state.sourceUrl);
      state.bookInfo = bookInfo;
    } catch (e) {
      console.error("[Reader] fetchBookInfo failed:", e);
      bookInfo = { name: "未知书籍", author: "未知作者" };
    }

    if (bookInfo.toc_url) {
      try {
        state.chapters = await fetchToc(bookInfo.toc_url, state.sourceUrl);
      } catch (e) {
        console.error("[Reader] fetchToc failed:", e);
        state.chapters = [];
      }
    }
  }

  return renderReaderContent();
}
```

- [ ] **Step 2: Update loadCurrentChapter to handle local epubs**

Modify `loadCurrentChapter`:

```typescript
async function loadCurrentChapter(container: HTMLElement) {
  const readerBody = $<HTMLElement>(container, "#reader-body");
  const prevBtn = $<HTMLButtonElement>(container, "#prev-chapter");
  const nextBtn = $<HTMLButtonElement>(container, "#next-chapter");
  const indicator = container.querySelector<HTMLElement>(".chapter-indicator");
  const tocItems = container.querySelectorAll<HTMLElement>(".toc-item");

  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) {
    readerBody.innerHTML = '<div class="error-msg">加载章节失败</div>';
    return;
  }

  readerBody.innerHTML = '<div class="loading">加载中...</div>';

  try {
    let content: string;
    if (state.bookUrl.startsWith("local://epub/")) {
      // Local epub chapter
      content = await readLocalEpub(state.bookUrl, state.currentChapterIndex);
    } else {
      // Network chapter
      content = await fetchContent(chapter.url, state.sourceUrl);
    }
    readerBody.innerHTML = `<article class="chapter-content">${content}</article>`;
  } catch (e) {
    console.error("[Reader] fetchContent failed:", chapter.url, e);
    readerBody.innerHTML = `<div class="error-msg">加载内容失败: ${e instanceof Error ? e.message : String(e)}</div>`;
  }

  tocItems.forEach((el) => {
    const idx = parseInt(el.dataset.chapter!);
    el.classList.toggle("active", idx === state.currentChapterIndex);
  });

  prevBtn.disabled = state.currentChapterIndex === 0;
  nextBtn.disabled = state.currentChapterIndex >= state.chapters.length - 1;
  if (indicator) indicator.textContent = `${state.currentChapterIndex + 1} / ${state.chapters.length || 1}`;

  await saveReadingProgress({
    book_id: state.bookUrl,
    chapter_index: state.currentChapterIndex,
    scroll_progress: 0,
    updated_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 3: Import listLocalEpubs and readLocalEpub in Reader.ts**

Update the import at the top:

```typescript
import {
  fetchBookInfo,
  fetchToc,
  fetchContent,
  getBook,
  getReadingProgress,
  saveReadingProgress,
  listLocalEpubs,
  readLocalEpub,
} from "../api.ts";
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Reader.ts
git commit -m "feat(reader): support local EPUB reading"
```

---

## Task 6: Add CSS styles for tabs

**Files:**
- Modify: (find the CSS file - likely `src/theme.ts` or a CSS file)

- [ ] **Step 1: Find and update CSS**

Locate the stylesheet and add:

```css
.shelf-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  border-radius: 4px;
}

.tab-btn:hover {
  background: var(--bg-hover);
}

.tab-btn.active {
  background: var(--primary-color);
  color: white;
}

#import-epub-btn {
  margin: 8px 16px;
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/theme.ts  # or whichever file has the styles
git commit -m "style: add shelf tab and import button styles"
```

---

## Task 7: Build and test

- [ ] **Step 1: Run TypeScript build check**

Run: `npm run build`
Expected: No errors

- [ ] **Step 2: Run Rust check**

Run: `cargo check --workspace`
Expected: No errors

- [ ] **Step 3: Test in dev mode**

Run: `npm run tauri dev`
Manual verification:
1. Open bookshelf page
2. Click "导入EPUB" button
3. Select an EPUB file
4. Verify book appears in "本地书籍" tab
5. Click the book to read
6. Navigate between chapters
7. Verify progress is saved

---

## Verification Checklist

- [ ] EPUB file import works from file dialog
- [ ] Imported book appears in local books tab
- [ ] Reading local EPUB displays chapter content
- [ ] Chapter navigation works (prev/next)
- [ ] TOC panel shows chapters
- [ ] Reading progress is saved and restored
- [ ] Delete removes both DB record and file
- [ ] No console errors in TypeScript
- [ ] No Rust compiler warnings
