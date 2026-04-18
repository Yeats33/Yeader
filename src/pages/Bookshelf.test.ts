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
  assert.ok(html.includes("书架为空"), "should show empty message");
  assert.ok(html.includes('data-nav="/search"'), "should link to search");
});

test("describeBookCards renders all books in grid mode", () => {
  const html = describeBookCards(MOCK_BOOKS, "grid");
  assert.ok(html.includes("book-grid"), "should use grid class");
  assert.ok(html.includes("三体"), "should render book name");
  assert.ok(html.includes("刘慈欣"), "should render author");
  assert.ok(html.includes("data-book-url"), "should have book URL");
  assert.ok(html.includes("阅读至第 45 章"), "should show progress");
});

test("describeBookCards renders all books in list mode", () => {
  const html = describeBookCards(MOCK_BOOKS, "list");
  assert.ok(html.includes("book-list"), "should use list class");
  assert.ok(html.includes("三体"), "should render book name");
  assert.ok(html.includes("刘慈欣"), "should render author");
});

test("describeBookCards shows progress text correctly", () => {
  // No progress = 待阅读
  const noProgress = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
  }], "grid");
  assert.ok(noProgress.includes("待阅读"), "should show 待阅读 for new book");

  // With total chapters
  const withProgress = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    reading_progress: 10,
    total_chapters: 50,
  }], "grid");
  assert.ok(withProgress.includes("阅读至第 10 章"), "should show chapter progress");

  // No total chapters = percentage
  const withPercent = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    reading_progress: 75,
  }], "grid");
  assert.ok(withPercent.includes("阅读 75%"), "should show percentage");
});

test("describeBookCards renders cover or placeholder", () => {
  const withCover = describeBookCards([{
    url: "https://x.com/b",
    name: "Test",
    author: "Author",
    source_url: "https://x.com",
    cover_url: "https://x.com/cover.jpg",
  }], "grid");
  assert.ok(withCover.includes('<img'), "should render cover image");
  assert.ok(!withCover.includes("book-cover-placeholder"), "should not show placeholder");

  const noCover = describeBookCards([{
    url: "https://x.com/b",
    name: "测试书",
    author: "Author",
    source_url: "https://x.com",
  }], "grid");
  assert.ok(noCover.includes("book-cover-placeholder"), "should show placeholder");
  assert.ok(noCover.includes("测"), "placeholder should show first char of name");
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
  assert.ok(!html.includes("<script>"), "should escape script tag");
  // Should contain escaped version
  assert.ok(html.includes("&lt;script&gt;"), "should contain escaped version");
});
