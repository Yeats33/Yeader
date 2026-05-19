import assert from "node:assert/strict";
import test from "node:test";
import { renderReaderContent } from "./render.ts";
import { createInitialState } from "./types.ts";

test("renderReaderContent includes reader search controls", () => {
  const state = createInitialState();
  state.bookInfo = { name: "测试书", author: "作者" };
  state.chapters = [
    { title: "第一章", url: "chapter-1", is_volume: false, is_vip: false },
  ];

  const html = renderReaderContent(state);

  assert.equal(html.includes('id="chapter-search-input"'), true);
  assert.equal(html.includes('id="chapter-search-prev"'), true);
  assert.equal(html.includes('id="chapter-search-next"'), true);
  assert.equal(html.includes('id="chapter-search-count"'), true);
});

test("renderReaderContent includes toc search and jump controls", () => {
  const state = createInitialState();
  state.chapters = [
    { title: "第一章", url: "chapter-1", is_volume: false, is_vip: false },
    { title: "第二章", url: "chapter-2", is_volume: false, is_vip: false },
  ];

  const html = renderReaderContent(state);

  assert.equal(html.includes('id="toc-search-input"'), true);
  assert.equal(html.includes('id="toc-jump-input"'), true);
  assert.equal(html.includes('id="toc-jump-btn"'), true);
  assert.equal(html.includes('max="2"'), true);
});

test("renderReaderContent shows current chapter summary in toc", () => {
  const state = createInitialState();
  state.chapters = [
    { title: "第一章", url: "chapter-1", is_volume: false, is_vip: false },
    { title: "第二章", url: "chapter-2", is_volume: false, is_vip: false },
  ];
  state.currentChapterIndex = 1;

  const html = renderReaderContent(state);

  assert.equal(html.includes('class="toc-current"'), true);
  assert.equal(html.includes('class="toc-current-position">2 / 2'), true);
  assert.equal(html.includes('class="toc-current-title">第二章'), true);
  assert.equal(html.includes('data-chapter="1" aria-current="true"'), true);
});

test("renderReaderContent shows current chapter beside book title", () => {
  const state = createInitialState();
  state.bookInfo = { name: "测试书", author: "作者" };
  state.chapters = [
    { title: "第一章", url: "chapter-1", is_volume: false, is_vip: false },
    { title: "第二章", url: "chapter-2", is_volume: false, is_vip: false },
  ];
  state.currentChapterIndex = 1;

  const html = renderReaderContent(state);

  assert.equal(html.includes('class="reader-title">测试书</h1>'), true);
  assert.equal(html.includes('class="reader-current-chapter" title="第二章">第二章</span>'), true);
});

test("renderReaderContent escapes chapter search value", () => {
  const state = createInitialState();
  state.searchQuery = '" autofocus onfocus="alert(1)';

  const html = renderReaderContent(state);

  assert.equal(html.includes('value="&quot; autofocus onfocus=&quot;alert(1)"'), true);
});

test("renderReaderContent escapes toc chapter titles", () => {
  const state = createInitialState();
  state.bookInfo = { name: "<书名>", author: "作者" };
  state.chapters = [
    { title: '<script>alert("x")</script>', url: "chapter-1", is_volume: false, is_vip: false },
  ];

  const html = renderReaderContent(state);

  assert.equal(html.includes("&lt;书名&gt;"), true);
  assert.equal(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"), true);
  assert.equal(html.includes("<script>"), false);
});
