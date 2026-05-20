import type { ReaderState } from "./types.ts";
import type { Chapter } from "../../types.ts";

const CHAPTER_NUMBER_PATTERN =
  /第[一二三四五六七八九十百千万\d]+[章回节集卷部]|Chapter\s*\d+|\bVol\.?\s*\d+|\d+[.\s、]/i;

function shouldAutoNumber(chapters: Chapter[]): boolean {
  if (chapters.length === 0) return false;
  const sample = chapters.slice(0, Math.min(5, chapters.length));
  return !sample.some((ch) => CHAPTER_NUMBER_PATTERN.test(ch.title));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReaderContent(state: ReaderState): string {
  const {
    bookInfo,
    chapters,
    currentChapterIndex,
    fontSize,
    lineHeight,
    fontFamily,
    theme,
    colorModePreference,
    showToc,
    showSettings,
    showBookmarks,
    chineseScript,
  } = state;
  const currentChapter = chapters[currentChapterIndex];
  const currentChapterTitle = currentChapter?.title ?? "未选择章节";
  const currentChapterPosition = chapters.length > 0
    ? `${currentChapterIndex + 1} / ${chapters.length}`
    : "0 / 0";

  return `
    <div class="page page-reader theme-${theme}" style="--font-size:${fontSize}px; --line-height:${lineHeight}; --font-family:${fontFamily};" tabindex="-1">
      <header class="reader-header">
        <button class="btn-icon" data-nav="/" title="返回">&#x2190;</button>
        <button class="btn-icon" id="reader-toc-btn" title="目录" ${chapters.length === 0 ? "disabled" : ""}>&#x2630;</button>
        <button class="btn-icon" id="reader-bookmarks-btn" title="书签">&#x1f516;</button>
        <div class="reader-title-group">
          <h1 class="reader-title">${escapeHtml(bookInfo?.name ?? "")}</h1>
          <span class="reader-current-chapter" title="${escapeHtml(currentChapterTitle)}">${escapeHtml(currentChapterTitle)}</span>
        </div>
        <button class="btn-icon" id="reader-settings-btn" title="设置">&#x2699;</button>
      </header>

      <div class="reader-searchbar">
        <input type="search" id="chapter-search-input" placeholder="搜索当前章节" value="${escapeHtml(state.searchQuery)}" />
        <button class="btn-icon" id="chapter-search-prev" title="上一个匹配">&#x2191;</button>
        <button class="btn-icon" id="chapter-search-next" title="下一个匹配">&#x2193;</button>
        <span class="chapter-search-count" id="chapter-search-count">${state.searchMatchCount === 0 ? "0 / 0" : `${state.searchMatchIndex + 1} / ${state.searchMatchCount}`}</span>
      </div>

      <main class="reader-body" id="reader-body">
        <div class="loading">加载中...</div>
      </main>

      ${chapters.length > 0 ? `
      <nav class="reader-toc ${showToc ? "" : "hidden"}" id="reader-toc">
        <div class="toc-header">
          <h2>目录</h2>
          <button class="btn-icon" id="toc-close">&#x2715;</button>
        </div>
        <div class="toc-current" id="toc-current">
          <span class="toc-current-label">当前章节</span>
          <span class="toc-current-position">${currentChapterPosition}</span>
          <strong class="toc-current-title">${escapeHtml(currentChapterTitle)}</strong>
        </div>
        <div class="toc-tools">
          <input type="search" id="toc-search-input" placeholder="搜索章节或编号" />
          <div class="toc-jump">
            <input type="number" id="toc-jump-input" min="1" max="${chapters.length}" placeholder="章节" />
            <button class="ctrl-btn" id="toc-jump-btn">跳转</button>
          </div>
        </div>
        <ul class="toc-list">
          ${(() => {
            const autoNumber = shouldAutoNumber(chapters);
            return chapters
              .map(
                (ch, i) => `
              <li class="toc-item ${i === currentChapterIndex ? "active" : ""}" data-chapter="${i}" ${i === currentChapterIndex ? 'aria-current="true"' : ""}>
                ${escapeHtml(`${autoNumber ? `第${i + 1}章 ` : ""}${ch.title}`)}
              </li>
            `,
              )
              .join("");
          })()}
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
          ${renderBookmarkListItems(state)}
        </ul>
      </div>

      <div class="reader-controls" id="reader-controls">
        <button class="ctrl-btn" id="prev-chapter" ${currentChapterIndex === 0 ? "disabled" : ""}>上一章</button>
        <span class="chapter-indicator">${currentChapterPosition}</span>
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
          <label>阅读背景</label>
          <div class="theme-selector">
            <button class="theme-btn ${theme === "light" ? "active" : ""}" data-theme="light">浅色</button>
            <button class="theme-btn ${theme === "dark" ? "active" : ""}" data-theme="dark">深色</button>
            <button class="theme-btn ${theme === "sepia" ? "active" : ""}" data-theme="sepia">护眼</button>
          </div>
        </div>
        <div class="setting-row">
          <label>显示模式</label>
          <div class="theme-selector">
            <button class="theme-btn ${colorModePreference === "system" ? "active" : ""}" data-color-mode="system">跟随系统</button>
            <button class="theme-btn ${colorModePreference === "light" ? "active" : ""}" data-color-mode="light">浅色</button>
            <button class="theme-btn ${colorModePreference === "dark" ? "active" : ""}" data-color-mode="dark">深色</button>
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
        <div class="setting-row">
          <label>字形</label>
          <div class="theme-selector">
            <button class="theme-btn ${chineseScript === "original" ? "active" : ""}" data-script="original">原文</button>
            <button class="theme-btn ${chineseScript === "simplified" ? "active" : ""}" data-script="simplified">简体</button>
            <button class="theme-btn ${chineseScript === "traditional" ? "active" : ""}" data-script="traditional">繁體</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderBookmarkListItems(state: ReaderState): string {
  const { bookmarks } = state;
  if (bookmarks.length === 0) {
    return '<li class="no-bookmarks">暂无书签</li>';
  }

  return bookmarks
    .map((bm, i) => {
      const position = bm.offset > 0 ? ` · 位置 ${bm.offset}` : "";
      return `
            <li class="bookmark-item" data-index="${i}">
              <span class="bookmark-page">第${bm.page + 1}章${position}</span>
              <span class="bookmark-content-text">${escapeHtml(bm.content || "无描述")}</span>
              <button class="bookmark-delete" data-index="${i}" type="button" title="删除">&#x2715;</button>
            </li>
          `;
    })
    .join("");
}
