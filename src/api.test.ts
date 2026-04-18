import assert from "node:assert/strict";
import test from "node:test";
import { listBookSources, listBooks } from "./api.ts";

test("listBookSources returns mock data when IPC is not available", async () => {
  const sources = await listBookSources();
  assert.equal(Array.isArray(sources), true);
});

test("listBooks returns mock data when IPC is not available", async () => {
  const books = await listBooks();
  assert.equal(Array.isArray(books), true);
  if (books.length > 0) {
    assert.equal(typeof books[0].name, "string");
    assert.equal(typeof books[0].author, "string");
  }
});
