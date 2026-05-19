import { fetchContent, fetchToc, fetchBookInfo, getReadingProgress, saveReadingProgress } from "../../api.ts";
import { loadReaderStyle } from "../Reader/style.ts";
import { createInitialState } from "../Reader/types.ts";
import type { ReaderState } from "../Reader/types.ts";
import { renderReaderContent } from "../Reader/render.ts";
import { initReaderHandlers } from "../Reader/handlers.ts";
import { loadBookmarks } from "../Reader/bookmarks.ts";

export function renderOnlineChapterPage(): string {
  return `<div class="page page-reader" id="online-chapter-container">
    <div class="loading">加载中...</div>
  </div>`;
}

export async function initOnlineChapter(
  container: HTMLElement,
  bookUrl: string,
  sourceUrl: string,
  chapterUrl: string,
): Promise<void> {
  const state: ReaderState = {
    ...createInitialState(),
    bookUrl: decodeURIComponent(bookUrl),
    sourceUrl: decodeURIComponent(sourceUrl),
  };

  try {
    const bookInfo = await fetchBookInfo(state.bookUrl, state.sourceUrl);
    state.bookInfo = bookInfo;

    const chapters = await fetchToc(state.bookUrl, state.sourceUrl);
    state.chapters = chapters;

    const currentIndex = chapters.findIndex((ch) => ch.url === chapterUrl);
    if (currentIndex >= 0) {
      state.currentChapterIndex = currentIndex;
    }

    const savedProgress = await getReadingProgress(state.bookUrl);
    if (savedProgress) {
      state.currentChapterIndex = savedProgress.chapter_index;
    }

    await loadReaderStyle(state);
    await loadBookmarks(state);

    const html = renderReaderContent(state);
    container.innerHTML = html;

    await initReaderHandlers(container, state, async (c) => {
      const readerBody = c.querySelector<HTMLElement>("#reader-body");
      if (!readerBody) return;

      const chapter = state.chapters[state.currentChapterIndex];
      if (!chapter) {
        readerBody.innerHTML = '<div class="error-msg">加载章节失败</div>';
        return;
      }

      readerBody.innerHTML = '<div class="loading">加载中...</div>';

      try {
        const content = await fetchContent(
          chapter.url,
          state.bookUrl,
          state.sourceUrl,
          state.currentChapterIndex + 1,
        );
        readerBody.innerHTML = `<article class="chapter-content">${content}</article>`;

        const { applyReaderStyleToContent } = await import("../Reader/style.ts");
        applyReaderStyleToContent(state);
      } catch (e) {
        readerBody.innerHTML = `<div class="error-msg">加载内容失败: ${e instanceof Error ? e.message : String(e)}</div>`;
      }

      const prevBtn = c.querySelector<HTMLButtonElement>("#prev-chapter");
      const nextBtn = c.querySelector<HTMLButtonElement>("#next-chapter");
      const indicator = c.querySelector<HTMLElement>(".chapter-indicator");
      if (prevBtn) prevBtn.disabled = state.currentChapterIndex === 0;
      if (nextBtn) nextBtn.disabled = state.currentChapterIndex >= state.chapters.length - 1;
      if (indicator) indicator.textContent = `${state.currentChapterIndex + 1} / ${state.chapters.length || 1}`;

      await saveReadingProgress({
        book_id: state.bookUrl,
        chapter_index: state.currentChapterIndex,
        chapter_title: chapter.title ?? "",
        offset: 0,
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="page"><div class="error-msg">加载失败: ${e instanceof Error ? e.message : String(e)}</div></div>`;
  }
}
