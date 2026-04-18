import { invoke } from "@tauri-apps/api/core";
import type {
  LegacyBookSource,
  LegacyRssSource,
  LegacyReplaceRule,
  Book,
  SearchResult,
  Chapter,
  BookInfo,
  ReadingProgress,
  ImportSummary,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Book Sources
// ---------------------------------------------------------------------------

export async function listBookSources(): Promise<LegacyBookSource[]> {
  try {
    return await invoke<LegacyBookSource[]>("list_book_sources");
  } catch {
    return mockBookSources();
  }
}

export async function deleteBookSource(url: string): Promise<boolean> {
  try {
    return await invoke<boolean>("delete_book_source", { url });
  } catch {
    return false;
  }
}

export async function toggleBookSource(
  _url: string,
  _enabled: boolean,
): Promise<boolean> {
  return true;
}

// ---------------------------------------------------------------------------
// RSS Sources
// ---------------------------------------------------------------------------

export async function listRssSources(): Promise<LegacyRssSource[]> {
  try {
    return await invoke<LegacyRssSource[]>("list_rss_sources");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Replace Rules
// ---------------------------------------------------------------------------

export async function listReplaceRules(): Promise<LegacyReplaceRule[]> {
  try {
    return await invoke<LegacyReplaceRule[]>("list_replace_rules");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Books / Library
// ---------------------------------------------------------------------------

export async function listBooks(): Promise<Book[]> {
  try {
    return await invoke<Book[]>("list_books");
  } catch {
    return mockBooks();
  }
}

export async function addBookToShelf(book: Book): Promise<boolean> {
  try {
    return await invoke<boolean>("add_book_to_shelf", { book });
  } catch {
    return false;
  }
}

export async function removeBook(url: string): Promise<boolean> {
  try {
    return await invoke<boolean>("remove_book", { url });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchBooks(
  sourceUrl: string,
  keyword: string,
  page: number = 1,
): Promise<SearchResult[]> {
  try {
    return await invoke<SearchResult[]>("search_books", {
      sourceUrl,
      keyword,
      page,
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export async function fetchBookInfo(
  bookUrl: string,
  sourceUrl: string,
): Promise<BookInfo> {
  try {
    return await invoke<BookInfo>("fetch_book_info", { bookUrl, sourceUrl });
  } catch {
    return { name: "", author: "" };
  }
}

export async function fetchToc(
  tocUrl: string,
  sourceUrl: string,
): Promise<Chapter[]> {
  try {
    return await invoke<Chapter[]>("fetch_toc", { tocUrl, sourceUrl });
  } catch {
    return [];
  }
}

export async function fetchContent(
  chapterUrl: string,
  sourceUrl: string,
): Promise<string> {
  try {
    return await invoke<string>("fetch_content", { chapterUrl, sourceUrl });
  } catch {
    return "";
  }
}

export async function getReadingProgress(
  bookId: string,
): Promise<ReadingProgress | null> {
  try {
    return await invoke<ReadingProgress | null>("get_reading_progress", {
      bookId,
    });
  } catch {
    return null;
  }
}

export async function saveReadingProgress(
  progress: ReadingProgress,
): Promise<void> {
  try {
    await invoke<void>("save_reading_progress", { progress });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export async function importBackup(path: string): Promise<ImportSummary> {
  try {
    return await invoke<ImportSummary>("import_backup", { path });
  } catch {
    return { book_sources_count: 0, rss_sources_count: 0, replace_rules_count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function mockBookSources(): LegacyBookSource[] {
  return [
    {
      book_source_url: "https://example.com/source1",
      book_source_name: "示例书源1",
      book_source_group: "默认",
      enabled: true,
    },
    {
      book_source_url: "https://example.com/source2",
      book_source_name: "示例书源2",
      book_source_group: "默认",
      enabled: false,
    },
  ];
}

function mockBooks(): Book[] {
  return [
    {
      url: "https://example.com/book1",
      name: "三体",
      author: "刘慈欣",
      source_url: "https://example.com/source1",
      reading_progress: 45,
      total_chapters: 80,
    },
    {
      url: "https://example.com/book2",
      name: "雪中悍刀行",
      author: "烽火戏诸侯",
      source_url: "https://example.com/source1",
      reading_progress: 102,
      total_chapters: 300,
    },
    {
      url: "https://example.com/book3",
      name: "置身事内",
      author: "兰小欢",
      source_url: "https://example.com/source2",
    },
  ];
}
