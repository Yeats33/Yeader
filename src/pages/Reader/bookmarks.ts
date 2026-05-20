import {
  getBookmark,
  saveBookmark,
} from "../../api.ts";
import type { ReaderState } from "./types.ts";

export async function loadBookmarks(state: ReaderState): Promise<void> {
  try {
    const bookmark = await getBookmark(state.bookUrl);
    if (bookmark && bookmark.list) {
      state.bookmarks = bookmark.list.map((m) => ({
        page: m.page,
        content: m.content,
        cfi: m.cfi,
        offset: m.offset ?? (Number.parseInt(m.cfi, 10) || 0),
      }));
    }
  } catch {
  }
}

export async function saveCurrentBookmark(state: ReaderState): Promise<void> {
  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) return;

  try {
    await saveBookmark(
      state.bookUrl,
      state.currentChapterIndex,
      chapter.title ?? "",
      window.innerWidth,
      window.innerHeight,
      state.currentCfi,
      Math.max(0, Math.round(state.currentOffset)),
    );
    await loadBookmarks(state);
  } catch {
  }
}

export async function deleteBookmark(state: ReaderState, index: number): Promise<void> {
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
      bookmark.offset,
      1, // action: 1 = delete
    );
    await loadBookmarks(state);
  } catch {
  }
}
