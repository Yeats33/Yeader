import {
  fetchBookInfo,
  fetchToc,
  fetchContent,
  getBook,
  getReadingProgress,
  saveReadingProgress,
  getEpubToc,
  readLocalEpub,
  saveReaderStyle,
  getReaderStyle,
  saveBookmark,
  getBookmark,
} from "../api.ts";
import { navigate } from "../router.ts";
import { $, $$ } from "../query.ts";
import { themeManager, type Theme } from "../utils/themeManager";
import type { BookInfo, Chapter } from "../types.ts";
import "./Reader.css";

interface ReaderState {
  bookInfo: BookInfo | null;
  chapters: Chapter[];
  currentChapterIndex: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: Theme;
  bookUrl: string;
  sourceUrl: string;
  showToc: boolean;
  showSettings: boolean;
  showBookmarks: boolean;
  bookmarks: Array<{ page: number; content: string; cfi: string }>;
  currentCfi: string;
}

const state: ReaderState = {
  bookInfo: null,
  chapters: [],
  currentChapterIndex: 0,
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "Noto Serif",
  theme: "light",
  bookUrl: "",
  sourceUrl: "",
  showToc: false,
  showSettings: false,
  showBookmarks: false,
  bookmarks: [],
  currentCfi: "",
};

export async function renderReaderPage(bookUrl: string): Promise<string> {
  state.bookUrl = decodeURIComponent(bookUrl);
  state.sourceUrl = "";
  state.currentChapterIndex = 0;
  state.bookInfo = null;
  state.chapters = [];
  state.showToc = false;
  state.showSettings = false;
  state.showBookmarks = false;
  state.bookmarks = [];

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

  // Load reader style settings
  await loadReaderStyle();

  // Load bookmarks
  await loadBookmarks();

  if (isLocalEpub) {
    // Load local epub chapters
    try {
      const toc = await getEpubToc(state.bookUrl);
      state.chapters = toc;
    } catch (e) {
      console.error("[Reader] getEpubToc failed:", e);
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

function renderReaderContent(): string {
  const {
    bookInfo,
    chapters,
    currentChapterIndex,
    fontSize,
    lineHeight,
    fontFamily,
    theme,
    showToc,
    showSettings,
    showBookmarks,
    bookmarks,
  } = state;

  return `
    <div class="page page-reader theme-${theme}" style="--font-size:${fontSize}px; --line-height:${lineHeight}; --font-family:${fontFamily};" tabindex="-1">
      <header class="reader-header">
        <button class="btn-icon" data-nav="/" title="返回">&#x2190;</button>
        <button class="btn-icon" id="reader-toc-btn" title="目录" ${chapters.length === 0 ? "disabled" : ""}>&#x2630;</button>
        <button class="btn-icon" id="reader-bookmarks-btn" title="书签">&#x1f516;</button>
        <h1 class="reader-title">${bookInfo?.name ?? ""}</h1>
        <button class="btn-icon" id="reader-settings-btn" title="设置">&#x2699;</button>
      </header>

      <main class="reader-body" id="reader-body">
        <div class="loading">加载中...</div>
      </main>

      ${chapters.length > 0 ? `
      <nav class="reader-toc ${showToc ? "" : "hidden"}" id="reader-toc">
        <div class="toc-header">
          <h2>目录</h2>
          <button class="btn-icon" id="toc-close">&#x2715;</button>
        </div>
        <ul class="toc-list">
          ${chapters
            .map(
              (ch, i) => `
            <li class="toc-item ${i === currentChapterIndex ? "active" : ""}" data-chapter="${i}">
              ${ch.title}
            </li>
          `,
            )
            .join("")}
        </ul>
      </nav>
      ` : ""}

      <div class="reader-bookmarks ${showBookmarks ? "" : "hidden"}" id="reader-bookmarks">
        <div class="bookmarks-header">
          <h2>书签</h2>
          <button class="btn-icon" id="bookmarks-close">&#x2715;</button>
        </div>
        <button class="btn-save-bookmark" id="save-bookmark-btn">保存当前书签</button>
        <ul class="bookmark-list">
          ${bookmarks.length === 0 ? '<li class="no-bookmarks">暂无书签</li>' : ""}
          ${bookmarks
            .map(
              (bm, i) => `
            <li class="bookmark-item" data-index="${i}">
              <span class="bookmark-page">第${bm.page + 1}章</span>
              <span class="bookmark-content-text">${bm.content || "无描述"}</span>
              <span class="bookmark-delete" data-index="${i}">&#x2715;</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>

      <div class="reader-controls" id="reader-controls">
        <button class="ctrl-btn" id="prev-chapter" ${currentChapterIndex === 0 ? "disabled" : ""}>上一章</button>
        <span class="chapter-indicator">${currentChapterIndex + 1} / ${chapters.length || 1}</span>
        <button class="ctrl-btn" id="next-chapter" ${currentChapterIndex >= chapters.length - 1 ? "disabled" : ""}>下一章</button>
      </div>

      <div class="reader-settings-panel ${showSettings ? "" : "hidden"}" id="reader-settings">
        <div class="setting-row">
          <label>字号</label>
          <input type="range" id="font-size-slider" min="12" max="28" value="${fontSize}" />
          <span id="font-size-val">${fontSize}px</span>
        </div>
        <div class="setting-row">
          <label>行距</label>
          <input type="range" id="line-height-slider" min="1.2" max="2.4" step="0.1" value="${lineHeight}" />
          <span id="line-height-val">${lineHeight}</span>
        </div>
        <div class="setting-row">
          <label>主题</label>
          <div class="theme-selector">
            <button class="theme-btn ${theme === "light" ? "active" : ""}" data-theme="light">浅色</button>
            <button class="theme-btn ${theme === "dark" ? "active" : ""}" data-theme="dark">深色</button>
            <button class="theme-btn ${theme === "sepia" ? "active" : ""}" data-theme="sepia">护眼</button>
          </div>
        </div>
        <div class="setting-row">
          <label>字体</label>
          <select id="font-family-select" class="font-selector">
            <option value="Noto Serif" ${fontFamily === "Noto Serif" ? "selected" : ""}>Noto Serif</option>
            <option value="Noto Sans" ${fontFamily === "Noto Sans" ? "selected" : ""}>Noto Sans</option>
            <option value="System UI" ${fontFamily === "System UI" ? "selected" : ""}>System UI</option>
            <option value="serif" ${fontFamily === "serif" ? "selected" : ""}>Serif</option>
            <option value="sans-serif" ${fontFamily === "sans-serif" ? "selected" : ""}>Sans Serif</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

async function loadReaderStyle(): Promise<void> {
  try {
    const style = await getReaderStyle();
    state.fontSize = style.font_size || 16;
    state.lineHeight = style.line_height || 1.6;
    state.fontFamily = style.font_family || "Noto Serif";
    state.theme = (style.theme as Theme) || "light";
    applyReaderStyle();
  } catch (e) {
    console.error("[Reader] loadReaderStyle failed:", e);
  }
}

async function saveReaderStyleSettings(): Promise<void> {
  try {
    await saveReaderStyle(state.fontFamily, state.fontSize, state.lineHeight, state.theme);
  } catch (e) {
    console.error("[Reader] saveReaderStyle failed:", e);
  }
}

function applyReaderStyle(): void {
  const root = document.documentElement;
  root.style.setProperty("--font-size", `${state.fontSize}px`);
  root.style.setProperty("--line-height", `${state.lineHeight}`);
  root.style.setProperty("--font-family", `"${state.fontFamily}", sans-serif`);
}

function applyReaderStyleToContent(): void {
  // Apply style to .chapter-content
  const chapterContent = document.querySelector(".chapter-content");
  if (chapterContent) {
    (chapterContent as HTMLElement).style.fontFamily = `"${state.fontFamily}", sans-serif`;
    (chapterContent as HTMLElement).style.fontSize = `${state.fontSize}px`;
    (chapterContent as HTMLElement).style.lineHeight = String(state.lineHeight);
  }
}

async function loadBookmarks(): Promise<void> {
  try {
    const bookmark = await getBookmark(state.bookUrl);
    if (bookmark && bookmark.list) {
      state.bookmarks = bookmark.list.map((m) => ({
        page: m.page,
        content: m.content,
        cfi: m.cfi,
      }));
    }
  } catch (e) {
    console.error("[Reader] loadBookmarks failed:", e);
  }
}

async function saveCurrentBookmark(): Promise<void> {
  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) return;

  try {
    const result = await saveBookmark(
      state.bookUrl,
      state.currentChapterIndex,
      chapter.title ?? "",
      window.innerWidth,
      window.innerHeight,
      state.currentCfi,
    );
    console.log("[Reader] Bookmark saved:", result);
    await loadBookmarks();
  } catch (e) {
    console.error("[Reader] saveBookmark failed:", e);
  }
}

async function deleteBookmark(index: number): Promise<void> {
  if (index < 0 || index >= state.bookmarks.length) return;
  const bookmark = state.bookmarks[index];
  try {
    await saveBookmark(
      state.bookUrl,
      bookmark.page,
      bookmark.content,
      window.innerWidth,
      window.innerHeight,
      bookmark.cfi,
      1, // action: 1 = delete
    );
    await loadBookmarks();
  } catch (e) {
    console.error("[Reader] deleteBookmark failed:", e);
  }
}

export async function initReaderHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const tocEl = $$<HTMLElement>(container, "#reader-toc");
  const tocCloseBtn = $$<HTMLButtonElement>(container, "#toc-close");
  const tocBtn = $<HTMLButtonElement>(container, "#reader-toc-btn");
  const readerBody = $<HTMLElement>(container, "#reader-body");
  const settingsPanel = $<HTMLElement>(container, "#reader-settings");
  const settingsBtn = $<HTMLButtonElement>(container, "#reader-settings-btn");
  const fontSizeSlider = $<HTMLInputElement>(container, "#font-size-slider");
  const fontSizeVal = $<HTMLElement>(container, "#font-size-val");
  const lineHeightSlider = $<HTMLInputElement>(container, "#line-height-slider");
  const lineHeightVal = $<HTMLElement>(container, "#line-height-val");
  const prevBtn = $<HTMLButtonElement>(container, "#prev-chapter");
  const nextBtn = $<HTMLButtonElement>(container, "#next-chapter");
  const bookmarksBtn = $<HTMLButtonElement>(container, "#reader-bookmarks-btn");
  const bookmarksPanel = $$<HTMLElement>(container, "#reader-bookmarks");
  const bookmarksCloseBtn = $$<HTMLButtonElement>(container, "#bookmarks-close");
  const saveBookmarkBtn = $$<HTMLButtonElement>(container, "#save-bookmark-btn");
  const themeBtns = container.querySelectorAll<HTMLButtonElement>(".theme-btn");
  const fontFamilySelect = $<HTMLSelectElement>(container, "#font-family-select");

  // TOC toggle
  tocCloseBtn?.addEventListener("click", () => {
    state.showToc = false;
    tocEl?.classList.add("hidden");
  });

  tocBtn?.addEventListener("click", () => {
    state.showToc = !state.showToc;
    tocEl?.classList.toggle("hidden", !state.showToc);
  });

  // Settings toggle
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.showSettings = !state.showSettings;
    settingsPanel.classList.toggle("hidden", !state.showSettings);
  });

  // Body click toggles panels
  readerBody.addEventListener("click", () => {
    if (state.showToc) {
      state.showToc = false;
      tocEl?.classList.add("hidden");
    } else if (state.showSettings) {
      state.showSettings = false;
      settingsPanel.classList.add("hidden");
    } else if (state.showBookmarks) {
      state.showBookmarks = false;
      bookmarksPanel?.classList.add("hidden");
    }
  });

  // Font size slider
  fontSizeSlider.addEventListener("input", () => {
    state.fontSize = parseInt(fontSizeSlider.value);
    document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
    fontSizeVal.textContent = `${state.fontSize}px`;
  });

  fontSizeSlider.addEventListener("change", () => {
    saveReaderStyleSettings();
    applyReaderStyleToContent();
  });

  // Line height slider
  lineHeightSlider.addEventListener("input", () => {
    state.lineHeight = parseFloat(lineHeightSlider.value);
    document.documentElement.style.setProperty("--line-height", `${state.lineHeight}`);
    lineHeightVal.textContent = String(state.lineHeight);
  });

  lineHeightSlider.addEventListener("change", () => {
    saveReaderStyleSettings();
    applyReaderStyleToContent();
  });

  // Theme buttons
  themeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const newTheme = btn.dataset.theme as Theme;
      if (newTheme) {
        state.theme = newTheme;
        themeManager.setTheme(newTheme);
        const pageEl = document.querySelector(".page-reader");
        if (pageEl) {
          pageEl.className = pageEl.className.replace(/theme-\w+/g, "");
          pageEl.classList.add(`theme-${newTheme}`);
        }
        themeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        saveReaderStyleSettings();
        applyReaderStyleToContent();
      }
    });
  });

  // Font family select
  fontFamilySelect?.addEventListener("change", () => {
    state.fontFamily = fontFamilySelect.value;
    applyReaderStyle();
    saveReaderStyleSettings();
    applyReaderStyleToContent();
  });

  // Navigation buttons
  prevBtn.addEventListener("click", () => {
    if (state.currentChapterIndex > 0) {
      state.currentChapterIndex--;
      loadCurrentChapter(container);
    }
  });

  nextBtn.addEventListener("click", () => {
    if (state.currentChapterIndex < state.chapters.length - 1) {
      state.currentChapterIndex++;
      loadCurrentChapter(container);
    }
  });

  // TOC items
  container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.chapter!);
      state.currentChapterIndex = idx;
      state.showToc = false;
      tocEl?.classList.add("hidden");
      loadCurrentChapter(container);
    });
  });

  // Bookmarks
  bookmarksBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.showBookmarks = !state.showBookmarks;
    bookmarksPanel?.classList.toggle("hidden", !state.showBookmarks);
  });

  bookmarksCloseBtn?.addEventListener("click", () => {
    state.showBookmarks = false;
    bookmarksPanel?.classList.add("hidden");
  });

  saveBookmarkBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    saveCurrentBookmark();
  });

  container.querySelectorAll<HTMLElement>(".bookmark-delete").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = parseInt(el.dataset.index!);
      deleteBookmark(index);
    });
  });

  container.querySelectorAll<HTMLElement>(".bookmark-item").forEach((el) => {
    el.addEventListener("click", () => {
      const index = parseInt(el.dataset.index!);
      const bookmark = state.bookmarks[index];
      if (bookmark) {
        state.currentChapterIndex = bookmark.page;
        state.showBookmarks = false;
        bookmarksPanel?.classList.add("hidden");
        loadCurrentChapter(container);
      }
    });
  });

  // Keyboard shortcuts
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    // Ignore if focus is on an input element
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;

    switch (e.key) {
      case "ArrowLeft":
      case "h":
        if (state.currentChapterIndex > 0) {
          state.currentChapterIndex--;
          loadCurrentChapter(container);
        }
        break;
      case "ArrowRight":
      case "l":
        if (state.currentChapterIndex < state.chapters.length - 1) {
          state.currentChapterIndex++;
          loadCurrentChapter(container);
        }
        break;
      case "t":
        state.showToc = !state.showToc;
        tocEl?.classList.toggle("hidden", !state.showToc);
        break;
      case "b":
        state.showBookmarks = !state.showBookmarks;
        bookmarksPanel?.classList.toggle("hidden", !state.showBookmarks);
        break;
      case "s":
        state.showSettings = !state.showSettings;
        settingsPanel.classList.toggle("hidden", !state.showSettings);
        break;
      case "m":
        saveCurrentBookmark();
        break;
      case "+":
      case "=":
        if (state.fontSize < 32) {
          state.fontSize += 2;
          document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
          fontSizeSlider.value = String(state.fontSize);
          fontSizeVal.textContent = `${state.fontSize}px`;
          saveReaderStyleSettings();
        }
        break;
      case "-":
        if (state.fontSize > 12) {
          state.fontSize -= 2;
          document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
          fontSizeSlider.value = String(state.fontSize);
          fontSizeVal.textContent = `${state.fontSize}px`;
          saveReaderStyleSettings();
        }
        break;
      case "Home":
      case "g":
        if (e.key === "g" && !e.shiftKey) break; // only "gg" case handled via two keystrokes
        state.currentChapterIndex = 0;
        loadCurrentChapter(container);
        break;
      case "End":
        state.currentChapterIndex = state.chapters.length - 1;
        loadCurrentChapter(container);
        break;
    }
  });

  await loadCurrentChapter(container);
}

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
    applyReaderStyleToContent();
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
    chapter_title: chapter.title ?? "",
    offset: 0,
  });
}
