import type { BookInfo, Chapter } from "../../types.ts";
import type { Theme } from "../../utils/themeManager";
import type { ChineseScript } from "../../utils/chineseConvert.ts";
import type { ColorModePreference } from "../../theme.ts";

export interface Bookmark {
  page: number;
  content: string;
  cfi: string;
  offset: number;
}

export interface ReaderState {
  bookInfo: BookInfo | null;
  chapters: Chapter[];
  currentChapterIndex: number;
  currentOffset: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: Theme;
  colorModePreference: ColorModePreference;
  bookUrl: string;
  sourceUrl: string;
  showToc: boolean;
  showSettings: boolean;
  showBookmarks: boolean;
  bookmarks: Bookmark[];
  currentCfi: string;
  chineseScript: ChineseScript;
  searchQuery: string;
  searchMatchIndex: number;
  searchMatchCount: number;
}

export function createInitialState(): ReaderState {
  return {
    bookInfo: null,
    chapters: [],
    currentChapterIndex: 0,
    currentOffset: 0,
    fontSize: 16,
    lineHeight: 1.6,
    fontFamily: "Noto Serif",
    theme: "light",
    colorModePreference: "system",
    bookUrl: "",
    sourceUrl: "",
    showToc: false,
    showSettings: false,
    showBookmarks: false,
    bookmarks: [],
    currentCfi: "",
    chineseScript: "original",
    searchQuery: "",
    searchMatchIndex: 0,
    searchMatchCount: 0,
  };
}

export function resetState(state: ReaderState): void {
  state.currentChapterIndex = 0;
  state.currentOffset = 0;
  state.bookInfo = null;
  state.chapters = [];
  state.showToc = false;
  state.showSettings = false;
  state.showBookmarks = false;
  state.bookmarks = [];
  state.searchQuery = "";
  state.searchMatchIndex = 0;
  state.searchMatchCount = 0;
}
