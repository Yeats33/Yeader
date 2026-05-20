import { invoke } from "@tauri-apps/api/core";
import type {
  YeaderSource,
  YeaderExploreCategory,
  Book,
  SearchResult,
  Chapter,
  BookInfo,
  ReadingProgress,
  ImportSummary,
  DevModeStatus,
  LogLine,
  ReaderStyle,
  BookMark,
  AuthResult,
  AuthSessionInfo,
  FeedSource,
  FeedItem,
} from "./types.ts";

type InvokeAdapter = typeof invoke;

let invokeAdapter: InvokeAdapter = invoke;

export function setInvokeAdapterForTests(adapter: InvokeAdapter): void {
  invokeAdapter = adapter;
}

export function resetInvokeAdapterForTests(): void {
  invokeAdapter = invoke;
}

export async function listYeaderSources(): Promise<YeaderSource[]> {
  return await invokeAdapter<YeaderSource[]>("list_yeader_sources");
}

export async function toggleYeaderSource(id: string, enabled: boolean): Promise<boolean> {
  return await invokeAdapter<boolean>("toggle_yeader_source", { id, enabled });
}

export async function deleteYeaderSource(id: string): Promise<boolean> {
  return await invokeAdapter<boolean>("delete_yeader_source", { id });
}

export async function importYeaderSourcePackJson(
  json: string,
): Promise<YeaderSource[]> {
  return await invokeAdapter<YeaderSource[]>("import_yeader_source_pack_json", { json });
}

export async function listBooks(): Promise<Book[]> {
  return await invokeAdapter<Book[]>("list_books");
}

export async function getBook(url: string): Promise<Book | null> {
  try {
    return await invokeAdapter<Book | null>("get_book", { url });
  } catch {
    return null;
  }
}

export async function addBookToShelf(book: Book): Promise<boolean> {
  return await invokeAdapter<boolean>("add_book_to_shelf", { book });
}

export async function removeBook(url: string): Promise<boolean> {
  return await invokeAdapter<boolean>("remove_book", { url });
}

export async function searchBooks(
  sourceId: string,
  keyword: string,
  page: number = 1,
): Promise<SearchResult[]> {
  return await invokeAdapter<SearchResult[]>("search_books", {
    sourceId,
    keyword,
    page,
  });
}

export async function listExploreCategories(
  sourceId: string,
): Promise<YeaderExploreCategory[]> {
  try {
    return await invokeAdapter<YeaderExploreCategory[]>("list_explore_categories", {
      sourceId,
    });
  } catch {
    return [];
  }
}

export async function exploreBooks(
  sourceId: string,
  category: string,
  variables: Record<string, string> = {},
  page: number = 1,
): Promise<SearchResult[]> {
  return await invokeAdapter<SearchResult[]>("explore_books", {
    sourceId,
    category,
    variables,
    page,
  });
}

export async function fetchBookInfo(
  bookUrl: string,
  sourceId: string,
): Promise<BookInfo> {
  return await invokeAdapter<BookInfo>("fetch_book_info", { bookUrl, sourceId });
}

export async function fetchToc(
  bookUrl: string,
  sourceId: string,
): Promise<Chapter[]> {
  try {
    return await invokeAdapter<Chapter[]>("fetch_toc", { bookUrl, sourceId });
  } catch (e) {
    throw new Error(`fetch_toc failed for ${bookUrl}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function fetchContent(
  chapterUrl: string,
  bookUrl: string,
  sourceId: string,
  chapterIndex?: number,
): Promise<string> {
  try {
    return await invokeAdapter<string>("fetch_content", {
      chapterUrl,
      bookUrl,
      sourceId,
      chapterIndex,
    });
  } catch (e) {
    throw new Error(`fetch_content failed for ${chapterUrl}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getReadingProgress(
  bookId: string,
): Promise<ReadingProgress | null> {
  try {
    return await invokeAdapter<ReadingProgress | null>("get_reading_progress", {
      bookId,
    });
  } catch {
    return null;
  }
}

export async function saveReadingProgress(
  progress: ReadingProgress,
): Promise<void> {
  await invokeAdapter<void>("save_reading_progress", { progress });
}

export async function importEpub(path: string): Promise<Book> {
  return await invokeAdapter<Book>("import_epub", { path });
}

export async function importEpubUrl(url: string): Promise<Book> {
  return await invokeAdapter<Book>("import_epub_url", { url });
}

export async function getEpubToc(bookUrl: string): Promise<Chapter[]> {
  return await invokeAdapter<Chapter[]>("get_epub_toc", { bookUrl });
}

export async function listLocalEpubs(): Promise<Book[]> {
  return await invokeAdapter<Book[]>("list_local_epubs");
}

export async function readLocalEpub(
  bookUrl: string,
  chapterIndex: number,
): Promise<string> {
  return await invokeAdapter<string>("read_local_epub", {
    bookUrl,
    chapterIndex,
  });
}

export async function deleteLocalEpub(bookUrl: string): Promise<boolean> {
  return await invokeAdapter<boolean>("delete_local_epub", { bookUrl });
}

export async function importBackup(path: string): Promise<ImportSummary> {
  return await invokeAdapter<ImportSummary>("import_backup", { path });
}

// ---- Dev mode ----

export async function getDevModeStatus(): Promise<DevModeStatus> {
  return await invokeAdapter<DevModeStatus>("get_dev_mode_status");
}

export async function toggleDevMode(enabled: boolean): Promise<boolean> {
  return await invokeAdapter<boolean>("toggle_dev_mode", { enabled });
}

export async function getLogLines(limit?: number): Promise<LogLine[]> {
  return await invokeAdapter<LogLine[]>("get_log_lines", { limit });
}

export async function openLogFile(): Promise<void> {
  return await invokeAdapter<void>("open_log_file");
}

export async function checkCommandExists(name: string): Promise<boolean> {
  return await invokeAdapter<boolean>("check_command_exists", { name });
}

export async function getCommandVersion(name: string): Promise<string> {
  return await invokeAdapter<string>("get_command_version", { name });
}

export async function openUrl(url: string): Promise<void> {
  return await invokeAdapter<void>("open_url_cmd", { url });
}

export async function runCommand(name: string, args: string[] = []): Promise<void> {
  return await invokeAdapter<void>("run_command", { name, args });
}

export async function startSoNovelWebui(): Promise<void> {
  return await invokeAdapter<void>("start_so_novel_webui");
}

export async function isSoNovelRunning(): Promise<boolean> {
  return await invokeAdapter<boolean>("is_so_novel_running");
}

export async function stopSoNovel(): Promise<void> {
  return await invokeAdapter<void>("stop_so_novel");
}

export async function getSoNovelConfig(): Promise<string> {
  return await invokeAdapter<string>("get_so_novel_config");
}

export async function saveSoNovelConfig(content: string): Promise<void> {
  return await invokeAdapter<void>("save_so_novel_config", { content });
}

export async function resetSoNovelConfig(): Promise<void> {
  return await invokeAdapter<void>("reset_so_novel_config");
}

export async function listSoNovelRules(): Promise<string[]> {
  return await invokeAdapter<string[]>("list_so_novel_rules");
}

export async function importSoNovelRule(name: string, content: string): Promise<void> {
  return await invokeAdapter<void>("import_so_novel_rule", { name, content });
}

export async function deleteSoNovelRule(name: string): Promise<void> {
  return await invokeAdapter<void>("delete_so_novel_rule", { name });
}

export async function getSoNovelActiveRule(): Promise<string> {
  return await invokeAdapter<string>("get_so_novel_active_rule");
}

export async function setSoNovelActiveRule(name: string): Promise<void> {
  return await invokeAdapter<void>("set_so_novel_active_rule", { name });
}

export async function saveReaderStyle(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  theme: string,
): Promise<string> {
  return await invokeAdapter<string>("save_reader_style", {
    fontFamily,
    fontSize,
    lineHeight,
    theme,
  });
}

export async function getReaderStyle(): Promise<ReaderStyle> {
  return await invokeAdapter<ReaderStyle>("get_reader_style");
}

export async function saveBookmark(
  bookPath: string,
  page: number,
  content: string,
  width: number,
  height: number,
  cfi: string,
  offset?: number,
  action?: number,
): Promise<string> {
  return await invokeAdapter<string>("save_bookmark", {
    bookPath,
    page,
    content,
    width,
    height,
    cfi,
    offset,
    action,
  });
}

export async function getBookmark(bookPath: string): Promise<BookMark> {
  return await invokeAdapter<BookMark>("get_bookmark", { bookPath });
}

export async function generateAuthNonce(): Promise<string> {
  return await invokeAdapter<string>("generate_auth_nonce");
}

export async function verifyEvmAuth(
  message: string,
  signature: string,
  address: string,
  chainId: number,
): Promise<AuthResult> {
  return await invokeAdapter<AuthResult>("verify_evm_auth", {
    message,
    signature,
    address,
    chainId,
  });
}

export async function getAuthSession(): Promise<AuthSessionInfo | null> {
  return await invokeAdapter<AuthSessionInfo | null>("get_auth_session");
}

export async function clearAuthSession(): Promise<void> {
  await invokeAdapter<void>("clear_auth_session");
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  return await invokeAdapter<FeedItem[]>("fetch_feed", { url });
}

export async function probeFeed(url: string): Promise<FeedSource> {
  return await invokeAdapter<FeedSource>("probe_feed", { url });
}
