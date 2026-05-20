import assert from "node:assert/strict";
import test from "node:test";
import { describeBookCards, describeBookshelfEmpty } from "./Bookshelf.ts";

const MOCK_BOOKS = [
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

test("describeBookshelfEmpty renders empty state", () => {
  const html = describeBookshelfEmpty();
  assert.equal(html.includes("书架为空"), true, "should show empty message");
  assert.equal(html.includes('data-nav="/search"'), true, "should link to search");
});

test("describeBookCards renders all books in grid mode", () => {
  const html = describeBookCards(MOCK_BOOKS, "grid");
  assert.equal(html.includes("book-grid"), true, "should use grid class");
  assert.equal(html.includes("三体"), true, "should render book name");
  assert.equal(html.includes("刘慈欣"), true, "should render author");
  assert.equal(html.includes("data-book-url"), true, "should have book URL");
  assert.equal(html.includes("阅读至第 45 章"), true, "should show progress");
});

test("describeBookCards renders all books in list mode", () => {
  const html = describeBookCards(MOCK_BOOKS, "list");
  assert.equal(html.includes("book-list"), true, "should use list class");
  assert.equal(html.includes("三体"), true, "should render book name");
  assert.equal(html.includes("刘慈欣"), true, "should render author");
});

test("describeBookCards shows progress text correctly", () => {
  // No progress = 待阅读
  const noProgress = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
  }], "grid");
  assert.equal(noProgress.includes("待阅读"), true, "should show 待阅读 for new book");

  // With total chapters
  const withProgress = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    reading_progress: 10,
    total_chapters: 50,
  }], "grid");
  assert.equal(withProgress.includes("阅读至第 10 章"), true, "should show chapter progress");

  // Reading progress is a 1-based chapter position even when total chapters are unknown
  const withUnknownTotal = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    reading_progress: 75,
    reading_chapter: "终章",
  }], "grid");
  assert.equal(withUnknownTotal.includes("阅读至第 75 章 · 终章"), true, "should show chapter progress");
});

test("describeBookCards renders cover or placeholder", () => {
  const withCover = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    cover_url: "https://x.com/cover.jpg",
  }], "grid");
  assert.equal(withCover.includes('<img'), true, "should render cover image");
  assert.equal(withCover.includes("book-cover-placeholder"), false, "should not show placeholder");

  const noCover = describeBookCards([{
    url: "https://x.com/b",
    name: "测试书",
    author: "Author",
    source_url: "https://x.com",
  }], "grid");
  assert.equal(noCover.includes("book-cover-placeholder"), true, "should show placeholder");
  assert.equal(noCover.includes("测"), true, "placeholder should show first char of name");
});

test("describeBookCards escapes HTML in book data", () => {
  const xssBook = [{
    url: "https://x.com/b",
    name: "<script>alert('xss')</script>",
    author: "Author & Co",
    source_url: "https://x.com",
  }];
  const html = describeBookCards(xssBook, "grid");
  // Should not contain unescaped script tag
  assert.equal(html.includes("<script>"), false, "should escape script tag");
  assert.equal(html.includes("&lt;script&gt;"), true, "should contain escaped version");
});
