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
import { navigate } from "../router.ts";
import { $, $$ } from "../query.ts";
import type { BookInfo, Chapter } from "../types.ts";

interface ReaderState {
  bookInfo: BookInfo | null;
  chapters: Chapter[];
  currentChapterIndex: number;
  fontSize: number;
  lineHeight: number;
  darkMode: boolean;
  bookUrl: string;
  sourceUrl: string;
}

const state: ReaderState = {
  bookInfo: null,
  chapters: [],
  currentChapterIndex: 0,
  fontSize: 16,
  lineHeight: 1.6,
  darkMode: false,
  bookUrl: "",
  sourceUrl: "",
};

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
        const chapterCount = (book.extra.chapter_count as number) || 0;
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

function renderReaderContent(): string {
  const { bookInfo, chapters, currentChapterIndex, fontSize, lineHeight, darkMode } = state;

  return `
    <div class="page page-reader ${darkMode ? "dark-mode" : ""}" style="--font-size:${fontSize}px; --line-height:${lineHeight};">
      <header class="reader-header">
        <button class="btn-icon" data-nav="/" title="返回">&#x2190;</button>
        <h1 class="reader-title">${bookInfo?.name ?? ""}</h1>
        <button class="btn-icon" id="reader-settings-btn" title="设置">&#x2699;</button>
      </header>

      <main class="reader-body" id="reader-body">
        <div class="loading">加载中...</div>
      </main>

      ${chapters.length > 0 ? `
      <nav class="reader-toc hidden" id="reader-toc">
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

      <div class="reader-controls" id="reader-controls">
        <button class="ctrl-btn" id="prev-chapter" ${currentChapterIndex === 0 ? "disabled" : ""}>上一章</button>
        <span class="chapter-indicator">${currentChapterIndex + 1} / ${chapters.length || 1}</span>
        <button class="ctrl-btn" id="next-chapter" ${currentChapterIndex >= chapters.length - 1 ? "disabled" : ""}>下一章</button>
      </div>

      <div class="reader-settings-panel hidden" id="reader-settings">
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
          <label>夜间模式</label>
          <button class="btn-toggle ${darkMode ? "active" : ""}" id="dark-mode-toggle">
            ${darkMode ? "开" : "关"}
          </button>
        </div>
      </div>
    </div>
  `;
}

export async function initReaderHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const tocEl = $$<HTMLElement>(container, "#reader-toc");
  const tocCloseBtn = $$<HTMLButtonElement>(container, "#toc-close");
  const readerBody = $<HTMLElement>(container, "#reader-body");
  const settingsPanel = $<HTMLElement>(container, "#reader-settings");
  const settingsBtn = $<HTMLButtonElement>(container, "#reader-settings-btn");
  const darkModeToggle = $<HTMLButtonElement>(container, "#dark-mode-toggle");
  const fontSizeSlider = $<HTMLInputElement>(container, "#font-size-slider");
  const fontSizeVal = $<HTMLElement>(container, "#font-size-val");
  const lineHeightSlider = $<HTMLInputElement>(container, "#line-height-slider");
  const lineHeightVal = $<HTMLElement>(container, "#line-height-val");
  const prevBtn = $<HTMLButtonElement>(container, "#prev-chapter");
  const nextBtn = $<HTMLButtonElement>(container, "#next-chapter");

  tocCloseBtn?.addEventListener("click", () => {
    tocEl?.classList.add("hidden");
  });

  readerBody.addEventListener("click", () => {
    if (tocEl && !tocEl.classList.contains("hidden")) {
      tocEl.classList.add("hidden");
    } else {
      settingsPanel.classList.toggle("hidden");
    }
  });

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle("hidden");
  });

  darkModeToggle.addEventListener("click", () => {
    state.darkMode = !state.darkMode;
    document.body.classList.toggle("dark-mode", state.darkMode);
    darkModeToggle.textContent = state.darkMode ? "开" : "关";
  });

  fontSizeSlider.addEventListener("input", () => {
    state.fontSize = parseInt(fontSizeSlider.value);
    document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
    fontSizeVal.textContent = `${state.fontSize}px`;
  });

  lineHeightSlider.addEventListener("input", () => {
    state.lineHeight = parseFloat(lineHeightSlider.value);
    document.documentElement.style.setProperty("--line-height", `${state.lineHeight}`);
    lineHeightVal.textContent = String(state.lineHeight);
  });

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

  container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.chapter!);
      state.currentChapterIndex = idx;
      tocEl?.classList.add("hidden");
      loadCurrentChapter(container);
    });
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
