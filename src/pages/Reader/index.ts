import {
  fetchBookInfo,
  fetchToc,
  getBook,
  getReadingProgress,
  getEpubToc,
} from "../../api.ts";
import { createInitialState, resetState } from "./types.ts";
import type { ReaderState } from "./types.ts";
import { renderReaderContent } from "./render.ts";
import { initReaderHandlers } from "./handlers.ts";
import { loadCurrentChapter } from "./chapter.ts";
import { loadReaderStyle } from "./style.ts";
import { loadBookmarks } from "./bookmarks.ts";

const state: ReaderState = createInitialState();

export async function renderReaderPage(bookUrl: string): Promise<string> {
  state.bookUrl = decodeURIComponent(bookUrl);
  state.sourceUrl = "";
  resetState(state);

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

  await loadReaderStyle(state);
  await loadBookmarks(state);

  if (isLocalEpub) {
    try {
      const toc = await getEpubToc(state.bookUrl);
      state.chapters = toc;
    } catch (e) {
      console.error("[Reader] getEpubToc failed:", e);
    }
  } else {
    try {
      const bookInfo = await fetchBookInfo(state.bookUrl, state.sourceUrl);
      state.bookInfo = bookInfo;

      state.chapters = await fetchToc(state.bookUrl, state.sourceUrl);
    } catch (e) {
      console.error("[Reader] fetchBookInfo failed:", e);
      state.bookInfo = { name: "未知书籍", author: "未知作者" };
      state.chapters = [];
    }
  }

  return renderReaderContent(state);
}

export async function initReader(container: HTMLElement) {
  await initReaderHandlers(container, state, (c) => loadCurrentChapter(c, state));
}
