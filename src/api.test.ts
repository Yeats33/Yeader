import assert from "node:assert/strict";
import test from "node:test";
import type {
  Book,
  BookSourceAvailability,
  LegacyBookSource,
} from "./types.ts";
import {
  deleteBookSource,
  deleteBookSources,
  deleteDisabledBookSources,
  enableAllBookSources,
  fetchBookInfo,
  fetchContent,
  fetchToc,
  listBookSources,
  listBooks,
  resetInvokeAdapterForTests,
  saveBookmark,
  setBookSourcesEnabled,
  setInvokeAdapterForTests,
  testBookSourcesAvailability,
  toggleBookSource,
} from "./api.ts";

type InvokeArgs = unknown;

const SAMPLE_SOURCES: LegacyBookSource[] = [
  {
    bookSourceUrl: "https://source-a.example",
    bookSourceName: "源 A",
    bookSourceGroup: "默认",
    enabled: true,
  },
  {
    bookSourceUrl: "https://source-b.example",
    bookSourceName: "源 B",
    bookSourceGroup: "默认",
    enabled: false,
  },
];

const SAMPLE_BOOKS: Book[] = [
  {
    url: "https://book.example/1",
    name: "测试书籍",
    author: "作者",
    source_url: "https://source-a.example",
  },
];

function installFakeInvoke() {
  const state = {
    sources: SAMPLE_SOURCES.map((source) => ({ ...source })),
  };

  setInvokeAdapterForTests(async <T>(command: string, args?: InvokeArgs): Promise<T> => {
    const recordArgs = (typeof args === "object" && args !== null)
      ? (args as Record<string, unknown>)
      : undefined;
    switch (command) {
      case "list_book_sources":
        return state.sources.map((source) => ({ ...source })) as T;
      case "list_books":
        return SAMPLE_BOOKS.map((book) => ({ ...book })) as T;
      case "delete_book_source": {
        const url = String(recordArgs?.["url"]);
        const before = state.sources.length;
        state.sources = state.sources.filter((source) => source.bookSourceUrl !== url);
        return (before !== state.sources.length) as T;
      }
      case "toggle_book_source": {
        const url = String(recordArgs?.["url"]);
        const enabled = Boolean(recordArgs?.["enabled"]);
        let changed = false;
        state.sources = state.sources.map((source) => {
          if (source.bookSourceUrl !== url) {
            return source;
          }
          changed = true;
          return { ...source, enabled };
        });
        return changed as T;
      }
      case "test_book_sources_availability": {
        const sourceUrls = (recordArgs?.["sourceUrls"] as string[] | undefined)
          ?? state.sources.map((source) => source.bookSourceUrl);
        const result: BookSourceAvailability[] = sourceUrls.map((sourceUrl) => ({
          sourceUrl,
          available: !sourceUrl.includes("source-b"),
          detail: sourceUrl.includes("source-b") ? "探测失败" : "探测通过",
          testedAt: "1713441600",
        }));
        return result as T;
      }
      default:
        throw new Error(`Unexpected command: ${command}`);
    }
  });
}

test("listBookSources reads data from injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const sources = await listBookSources();
  assert.equal(sources.length, 2);
  assert.equal(sources[0]?.bookSourceName, "源 A");
});

test("saveBookmark passes offset and delete action to Tauri", async () => {
  resetInvokeAdapterForTests();
  const calls: Array<{ command: string; args: InvokeArgs }> = [];

  setInvokeAdapterForTests(async <T>(command: string, args?: InvokeArgs): Promise<T> => {
    calls.push({ command, args });
    return "book-1" as T;
  });

  await saveBookmark("book-1", 2, "第二章", 800, 600, "", 120);
  await saveBookmark("book-1", 2, "第二章", 800, 600, "", 120, 1);

  assert.equal(JSON.stringify(calls), JSON.stringify([
    {
      command: "save_bookmark",
      args: {
        bookPath: "book-1",
        page: 2,
        content: "第二章",
        width: 800,
        height: 600,
        cfi: "",
        offset: 120,
        action: undefined,
      },
    },
    {
      command: "save_bookmark",
      args: {
        bookPath: "book-1",
        page: 2,
        content: "第二章",
        width: 800,
        height: 600,
        cfi: "",
        offset: 120,
        action: 1,
      },
    },
  ]));
});

test("listBooks reads data from injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const books = await listBooks();
  assert.equal(books.length, 1);
  assert.equal(books[0]?.name, "测试书籍");
});

test("deleteBookSource mutates state through injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const deleted = await deleteBookSource("https://source-a.example");
  assert.equal(deleted, true);

  const remaining = await listBookSources();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.bookSourceUrl, "https://source-b.example");
});

test("toggleBookSource mutates state through injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const toggled = await toggleBookSource("https://source-b.example", true);
  assert.equal(toggled, true);

  const sources = await listBookSources();
  assert.equal(sources.every((source) => source.enabled), true);
});

test("testBookSourcesAvailability uses injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const statuses = await testBookSourcesAvailability();
  assert.equal(statuses.length, 2);
  assert.equal(statuses.some((status) => status.available === false), true);
});

test("enableAllBookSources uses real list and toggle commands instead of embedded mock state", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const changed = await enableAllBookSources();
  assert.equal(changed, 1);

  const sources = await listBookSources();
  assert.equal(sources.every((source) => source.enabled), true);
});

test("setBookSourcesEnabled updates only selected sources", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const changed = await setBookSourcesEnabled(["https://source-a.example"], false);
  assert.equal(changed, 1);

  const sources = await listBookSources();
  const sourceA = sources.find((source) => source.bookSourceUrl === "https://source-a.example");
  const sourceB = sources.find((source) => source.bookSourceUrl === "https://source-b.example");
  assert.equal(sourceA?.enabled, false);
  assert.equal(sourceB?.enabled, false);
});

test("deleteDisabledBookSources uses real list and delete commands instead of embedded mock state", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const deleted = await deleteDisabledBookSources();
  assert.equal(deleted, 1);

  const sources = await listBookSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.bookSourceUrl, "https://source-a.example");
});

test("deleteBookSources deletes all requested sources", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const deleted = await deleteBookSources(SAMPLE_SOURCES.map((source) => source.bookSourceUrl));
  assert.equal(deleted, 2);

  const sources = await listBookSources();
  assert.equal(sources.length, 0);
});

test("reader commands pass camelCase Tauri arguments", async () => {
  resetInvokeAdapterForTests();
  const calls: Array<{ command: string; args: InvokeArgs }> = [];

  setInvokeAdapterForTests(async <T>(command: string, args?: InvokeArgs): Promise<T> => {
    calls.push({ command, args });
    if (command === "fetch_book_info") {
      return { name: "测试书籍", author: "作者" } as T;
    }
    if (command === "fetch_toc") {
      return [] as T;
    }
    if (command === "fetch_content") {
      return "正文" as T;
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  await fetchBookInfo("book-1", "source-1");
  await fetchToc("book-1", "source-1");
  await fetchContent("chapter-1", "book-1", "source-1", 2);

  assert.equal(JSON.stringify(calls), JSON.stringify([
    {
      command: "fetch_book_info",
      args: { bookUrl: "book-1", sourceId: "source-1" },
    },
    {
      command: "fetch_toc",
      args: { bookUrl: "book-1", sourceId: "source-1" },
    },
    {
      command: "fetch_content",
      args: {
        chapterUrl: "chapter-1",
        bookUrl: "book-1",
        sourceId: "source-1",
        chapterIndex: 2,
      },
    },
  ]));
});
