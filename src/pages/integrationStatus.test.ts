import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanCommandVersion,
  soNovelDescription,
  soNovelStatusLabel,
  type SoNovelState,
} from "./integrationStatus.ts";

test("cleanCommandVersion removes ansi codes and surrounding whitespace", () => {
  assert.equal(cleanCommandVersion("\u001b[32mso-novel 1.10.1\u001b[0m\n"), "so-novel 1.10.1");
});

test("soNovelStatusLabel distinguishes installed and running states", () => {
  const installed: SoNovelState = {
    status: "installed",
    version: "1.10.1",
    running: false,
    error: null,
  };
  const running: SoNovelState = { ...installed, running: true };

  assert.equal(soNovelStatusLabel(installed), "已安装");
  assert.equal(soNovelStatusLabel(running), "运行中");
});

test("soNovelDescription surfaces status check errors", () => {
  assert.equal(
    soNovelDescription({
      status: "error",
      version: "",
      running: null,
      error: "which failed",
    }),
    "which failed",
  );
});
