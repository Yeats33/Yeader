import assert from "node:assert/strict";
import test from "node:test";
import { matchRoute } from "./router.ts";

test("matchRoute matches root path", () => {
  const result = matchRoute("/", { path: "/" });
  assert.equal(result === null, false);
});

test("matchRoute matches simple path", () => {
  const result = matchRoute("/search", { path: "/search" });
  assert.equal(result === null, false);
});

test("matchRoute extracts params", () => {
  const result = matchRoute("/reader/:bookId", { path: "/reader/https%3A%2F%2Fexample.com%2Fbook1" });
  assert.equal(result === null, false);
  assert.equal(result!["bookId"], "https%3A%2F%2Fexample.com%2Fbook1");
});

test("matchRoute returns null on mismatch", () => {
  const result = matchRoute("/search", { path: "/settings" });
  assert.equal(result, null);
});

test("matchRoute returns null on different segment count", () => {
  const result = matchRoute("/reader/:bookId", { path: "/reader" });
  assert.equal(result, null);
});
