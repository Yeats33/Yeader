import type { BookInfo, Chapter } from "../../types.ts";
import type { Theme } from "../../utils/themeManager";

export interface Bookmark {
  page: number;
  content: string;
  cfi: string;
}

export interface ReaderState {
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
  bookmarks: Bookmark[];
  currentCfi: string;
}

export function createInitialState(): ReaderState {
  return {
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
}

export function resetState(state: ReaderState): void {
  state.currentChapterIndex = 0;
  state.bookInfo = null;
  state.chapters = [];
  state.showToc = false;
  state.showSettings = false;
  state.showBookmarks = false;
  state.bookmarks = [];
}