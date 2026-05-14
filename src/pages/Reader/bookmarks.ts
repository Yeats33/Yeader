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
      }));
    }
  } catch (e) {
    console.error("[Reader] loadBookmarks failed:", e);
  }
}

export async function saveCurrentBookmark(state: ReaderState): Promise<void> {
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
    await loadBookmarks(state);
  } catch (e) {
    console.error("[Reader] saveBookmark failed:", e);
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
      1, // action: 1 = delete
    );
    await loadBookmarks(state);
  } catch (e) {
    console.error("[Reader] deleteBookmark failed:", e);
  }
}