import assert from "node:assert/strict";
import test from "node:test";
import {
  runAvailabilityChecksIncrementally,
  describeLastTestedText,
  describeBookSourceTree,
  getDeleteAllButtonLabel,
  getSourceDeleteButtonLabel,
  mergeAvailabilityResults,
  renderSettingsPage,
} from "./Settings.ts";
import { resetInvokeAdapterForTests, setInvokeAdapterForTests } from "../api.ts";

const MOCK_SOURCES = [
  {
    bookSourceUrl: "https://example.com/direct-a.json",
    bookSourceName: "直连-A",
    bookSourceGroup: "男频",
    enabled: true,
  },
  {
    bookSourceUrl: "https://example.com/direct-b.json",
    bookSourceName: "直连-B",
    bookSourceGroup: "女频",
    enabled: false,
  },
  {
    bookSourceUrl: "https://example.com/sub-a.json",
    bookSourceName: "订阅-A",
    bookSourceGroup: "精选",
    subscriptionUrl: "https://sub.example.com/all.json",
    enabled: true,
  },
  {
    bookSourceUrl: "https://example.com/sub-b.json",
    bookSourceName: "订阅-B",
    bookSourceGroup: "精选",
    subscriptionUrl: "https://sub.example.com/all.json",
    enabled: false,
  },
];

test("describeBookSourceTree renders direct and subscription tiers", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("直接导入"), true, "should render direct tier");
  assert.equal(html.includes("订阅源"), true, "should render subscription tier");
  assert.equal(html.includes("https://sub.example.com/all.json"), true, "should render subscription URL");
  assert.equal(html.includes("男频"), true, "should render direct group");
  assert.equal(html.includes("精选"), true, "should render subscription group");
});

test("describeBookSourceTree renders group and subscription bulk toggles", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("启用本组"), true, "should render group-level enable toggle");
  assert.equal(html.includes("删除本组"), true, "should render group-level delete action");
  assert.equal(html.includes("启用订阅"), true, "should render subscription-level enable toggle");
  assert.equal(html.includes("data-bulk-toggle"), true, "should render bulk toggle hooks");
});

test("describeBookSourceTree shows enabled summaries at multiple levels", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("1/2 启用"), true, "should render summary chips");
  assert.equal(html.includes("已启用"), true, "should render leaf enabled state");
  assert.equal(html.includes("已禁用"), true, "should render leaf disabled state");
});

test("describeBookSourceTree renders quick actions and availability placeholders", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("测试可用性"), true, "should render availability test action");
  assert.equal(html.includes("测试此层"), true, "should render tier-level availability action");
  assert.equal(html.includes("测试订阅"), true, "should render subscription-level availability action");
  assert.equal(html.includes("测试本组"), true, "should render group-level availability action");
  assert.equal(html.includes("测试书源"), true, "should render source-level availability action");
  assert.equal(html.includes("禁用不可用"), true, "should render disable unavailable action");
  assert.equal(html.includes("启用全部"), true, "should render enable all action");
  assert.equal(html.includes("删除已禁用"), true, "should render delete disabled action");
  assert.equal(html.includes("开发专用：删除全部"), true, "should render dev delete all action");
  assert.equal(html.includes("未测试"), true, "should render default availability state");
  assert.equal(html.includes("data-availability-status"), true, "should render availability chip hooks");
  assert.equal(html.includes("data-availability-test"), true, "should render scoped availability hooks");
});

test("delete confirmation labels switch to explicit second-step copy", () => {
  assert.equal(getSourceDeleteButtonLabel(false), "删除");
  assert.equal(getSourceDeleteButtonLabel(true), "确认删除");
  assert.equal(getDeleteAllButtonLabel(false), "开发专用：删除全部");
  assert.equal(getDeleteAllButtonLabel(true), "确认删除全部");
});

test("mergeAvailabilityResults keeps only the latest result per source", () => {
  const merged = mergeAvailabilityResults(
    {
      "https://example.com/a": {
        sourceUrl: "https://example.com/a",
        available: true,
        detail: "旧结果",
        testedAt: "2026-04-18T10:00:00.000Z",
      },
    },
    [
      {
        sourceUrl: "https://example.com/a",
        available: false,
        detail: "新结果",
      },
      {
        sourceUrl: "https://example.com/b",
        available: true,
      },
    ],
    "2026-04-18T12:00:00.000Z",
  );

  assert.equal(merged["https://example.com/a"]?.available, false);
  assert.equal(merged["https://example.com/a"]?.testedAt, "2026-04-18T12:00:00.000Z");
  assert.equal(merged["https://example.com/b"]?.testedAt, "2026-04-18T12:00:00.000Z");
});

test("describeLastTestedText formats persisted timestamp for display", () => {
  const now = new Date("2026-04-18T12:34:56.000Z");

  assert.equal(describeLastTestedText("2026-04-18T12:34:40.000Z", now), "刚刚测试");
  assert.equal(describeLastTestedText("2026-04-18T12:00:00.000Z", now), "34 分钟前");
  assert.equal(describeLastTestedText("2026-04-18T08:15:00.000Z", now), "今天 09:15");
  assert.equal(describeLastTestedText("2026-04-17T21:30:00.000Z", now), "昨天 22:30");
  assert.equal(describeLastTestedText("2026-03-01T09:05:00.000Z", now), "03-01 09:05");
});

test("runAvailabilityChecksIncrementally emits results as each source finishes", async () => {
  const emitted: string[] = [];
  const completed = await runAvailabilityChecksIncrementally(
    ["fast", "slow"],
    async (sourceUrl) => {
      if (sourceUrl === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return {
        sourceUrl,
        available: sourceUrl === "fast",
      };
    },
    (status) => {
      emitted.push(status.sourceUrl);
    },
  );

  assert.equal(JSON.stringify(emitted), JSON.stringify(["fast", "slow"]));
  assert.equal(completed.length, 2);
});

test("renderSettingsPage marks fixture import as dev-only", async () => {
  resetInvokeAdapterForTests();
  setInvokeAdapterForTests(async <T>(command: string) => {
    if (command === "list_book_sources") {
      return MOCK_SOURCES as T;
    }
    if (command === "list_replace_rules") {
      return [] as T;
    }
    throw new Error(`unexpected command: ${command}`);
  });

  const html = await renderSettingsPage();
  assert.equal(html.includes("开发专用：导入测试书源"), true, "should render dev-only fixture import");

  resetInvokeAdapterForTests();
});

test("describeBookSourceTree escapes unsafe values", () => {
  const html = describeBookSourceTree([
    {
      bookSourceUrl: "https://example.com/<bad>",
      bookSourceName: "<script>alert('xss')</script>",
      bookSourceGroup: "默认",
      subscriptionUrl: "https://sub.example.com/?q=<x>",
      enabled: true,
    },
  ]);

  assert.equal(html.includes("<script>"), false, "should escape script tag");
  assert.equal(html.includes("&lt;script&gt;"), true, "should keep escaped script text");
  assert.equal(html.includes("&lt;x&gt;"), true, "should escape subscription URL");
});
