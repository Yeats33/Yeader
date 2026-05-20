import assert from "node:assert/strict";
import test from "node:test";

import { convertChineseScript } from "./chineseConvert.ts";

test("returns original text without conversion", () => {
  const text = "头发與發財";

  assert.equal(convertChineseScript(text, "original"), text);
});

test("converts simplified Chinese to traditional Chinese with phrase context", () => {
  assert.equal(convertChineseScript("头发发财", "traditional"), "頭髮發財");
});

test("converts traditional Chinese to simplified Chinese with phrase context", () => {
  assert.equal(convertChineseScript("頭髮發財", "simplified"), "头发发财");
});
