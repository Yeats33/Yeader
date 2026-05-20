import assert from "node:assert/strict";
import test from "node:test";
import type {
  Book,
  YeaderSource,
} from "./types.ts";
import {
  fetchBookInfo,
  fetchContent,
  fetchToc,
  listBooks,
  listYeaderSources,
  resetInvokeAdapterForTests,
  saveBookmark,
  setInvokeAdapterForTests,
} from "./api.ts";

type InvokeArgs = unknown;

const SAMPLE_SOURCES: YeaderSource[] = [
  {
    id: "source-a",
    name: "源 A",
    mediaType: "generic",
    enabled: true,
    capabilities: [{ kind: "search" }],
  },
  {
    id: "source-b",
    name: "源 B",
    mediaType: "rss",
    enabled: false,
    capabilities: [{ kind: "feed" }],
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
  setInvokeAdapterForTests(async <T>(command: string): Promise<T> => {
    switch (command) {
      case "list_yeader_sources":
        return SAMPLE_SOURCES.map((source) => ({ ...source })) as T;
      case "list_books":
        return SAMPLE_BOOKS.map((book) => ({ ...book })) as T;
      default:
        throw new Error(`Unexpected command: ${command}`);
    }
  });
}

test("listYeaderSources reads data from injected invoke adapter", async () => {
  resetInvokeAdapterForTests();
  installFakeInvoke();

  const sources = await listYeaderSources();
  assert.equal(sources.length, 2);
  assert.equal(sources[0]?.name, "源 A");
  assert.equal(sources[1]?.mediaType, "rss");
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
