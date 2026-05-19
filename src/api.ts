import { invoke } from "@tauri-apps/api/core";
import type {
  LegacyBookSource,
  LegacyRssSource,
  LegacyReplaceRule,
  YeaderSource,
  Book,
  SearchResult,
  Chapter,
  BookInfo,
  ReadingProgress,
  ImportSummary,
  BookSourceAvailability,
  DevModeStatus,
  LogLine,
  ReaderStyle,
  BookMark,
  AuthResult,
  AuthSessionInfo,
} from "./types.ts";

type InvokeAdapter = typeof invoke;

let invokeAdapter: InvokeAdapter = invoke;

export function setInvokeAdapterForTests(adapter: InvokeAdapter): void {
  invokeAdapter = adapter;
}

export function resetInvokeAdapterForTests(): void {
  invokeAdapter = invoke;
}

export async function listBookSources(): Promise<LegacyBookSource[]> {
  return await invokeAdapter<LegacyBookSource[]>("list_book_sources");
}

export async function listYeaderSources(): Promise<YeaderSource[]> {
  return await invokeAdapter<YeaderSource[]>("list_yeader_sources");
}

export async function importYeaderSourcePackJson(
  json: string,
): Promise<YeaderSource[]> {
  return await invokeAdapter<YeaderSource[]>("import_yeader_source_pack_json", { json });
}

export async function loadBookSourcesFromFile(): Promise<LegacyBookSource[]> {
  return await invokeAdapter<LegacyBookSource[]>("load_book_sources_from_file");
}

export async function importBookSourcesJson(
  json: string,
): Promise<LegacyBookSource[]> {
  return await invokeAdapter<LegacyBookSource[]>("import_book_sources_json", { json });
}

export async function importBookSourcesUrl(
  url: string,
): Promise<LegacyBookSource[]> {
  return await invokeAdapter<LegacyBookSource[]>("import_book_sources_url", { url });
}

export async function importBookSourcesSubscription(
  url: string,
): Promise<LegacyBookSource[]> {
  return await invokeAdapter<LegacyBookSource[]>("import_book_sources_subscription", { url });
}

export async function testBookSourcesAvailability(
  sourceUrls?: string[],
): Promise<BookSourceAvailability[]> {
  return await invokeAdapter<BookSourceAvailability[]>("test_book_sources_availability", {
    sourceUrls,
  });
}

export async function deleteBookSource(url: string): Promise<boolean> {
  return await invokeAdapter<boolean>("delete_book_source", { url });
}

export async function toggleBookSource(
  url: string,
  enabled: boolean,
): Promise<boolean> {
  return await invokeAdapter<boolean>("toggle_book_source", { url, enabled });
}

export async function setBookSourcesEnabled(
  sourceUrls: string[],
  enabled: boolean,
): Promise<number> {
  let changed = 0;
  for (const sourceUrl of sourceUrls) {
    if (await toggleBookSource(sourceUrl, enabled)) {
      changed += 1;
    }
  }
  return changed;
}

export async function enableAllBookSources(): Promise<number> {
  const sources = await listBookSources();
  return await setBookSourcesEnabled(
    sources.filter((source) => !source.enabled).map((source) => source.bookSourceUrl),
    true,
  );
}

export async function deleteBookSources(sourceUrls: string[]): Promise<number> {
  let deleted = 0;
  for (const sourceUrl of sourceUrls) {
    if (await deleteBookSource(sourceUrl)) {
      deleted += 1;
    }
  }
  return deleted;
}

export async function deleteDisabledBookSources(): Promise<number> {
  const sources = await listBookSources();
  return await deleteBookSources(
    sources.filter((source) => !source.enabled).map((source) => source.bookSourceUrl),
  );
}

export async function listRssSources(): Promise<LegacyRssSource[]> {
  try {
    return await invokeAdapter<LegacyRssSource[]>("list_rss_sources");
  } catch {
    return [];
  }
}

export async function listReplaceRules(): Promise<LegacyReplaceRule[]> {
  try {
    return await invokeAdapter<LegacyReplaceRule[]>("list_replace_rules");
  } catch {
    return [];
  }
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
  action?: number,
): Promise<string> {
  return await invokeAdapter<string>("save_bookmark", {
    bookPath,
    page,
    content,
    width,
    height,
    cfi,
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
