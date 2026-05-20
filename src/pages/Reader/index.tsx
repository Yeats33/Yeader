import { useEffect, useRef } from "react";
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
import { getColorModePreference } from "../../theme.ts";

const state: ReaderState = createInitialState();

export async function renderReaderPage(bookUrl: string): Promise<string> {
  state.bookUrl = decodeURIComponent(bookUrl);
  state.sourceUrl = "";
  resetState(state);
  state.colorModePreference = getColorModePreference();

  const isLocalEpub = state.bookUrl.startsWith("local://epub/");

  // Look up the book from library to get source_url
  try {
    const book = await getBook(state.bookUrl);
    if (book) {
      state.sourceUrl = book.source_url;
    }
  } catch {
  }

  const savedProgress = await getReadingProgress(state.bookUrl);
  if (savedProgress) {
    state.currentChapterIndex = savedProgress.chapter_index;
    state.currentOffset = savedProgress.offset;
  }

  await loadReaderStyle(state);
  await loadBookmarks(state);

  if (isLocalEpub) {
    try {
      const toc = await getEpubToc(state.bookUrl);
      state.chapters = toc;
    } catch {
    }
  } else {
    try {
      const bookInfo = await fetchBookInfo(state.bookUrl, state.sourceUrl);
      state.bookInfo = bookInfo;

      state.chapters = await fetchToc(state.bookUrl, state.sourceUrl);
    } catch {
      state.bookInfo = { name: "未知书籍", author: "未知作者" };
      state.chapters = [];
    }
  }

  return renderReaderContent(state);
}

export async function initReader(container: HTMLElement) {
  await initReaderHandlers(container, state, (c) => loadCurrentChapter(c, state));
}

export function ReaderPage({ bookUrl }: { bookUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const pageHost = host;

    pageHost.innerHTML = '<div class="page page-reader"><div class="loading">加载中...</div></div>';

    async function load() {
      const html = await renderReaderPage(bookUrl);
      if (cancelled) return;
      pageHost.innerHTML = html;
      const page = pageHost.querySelector<HTMLElement>(".page-reader");
      if (page) {
        await initReader(page);
      }
    }

    void load();

    return () => {
      cancelled = true;
      pageHost.innerHTML = "";
    };
  }, [bookUrl]);

  return <div ref={hostRef} />;
}
