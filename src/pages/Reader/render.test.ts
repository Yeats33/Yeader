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

test("renderReaderContent escapes chapter search value", () => {
  const state = createInitialState();
  state.searchQuery = '" autofocus onfocus="alert(1)';

  const html = renderReaderContent(state);

  assert.equal(html.includes('value="&quot; autofocus onfocus=&quot;alert(1)"'), true);
});
