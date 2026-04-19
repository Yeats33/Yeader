import assert from "node:assert/strict";
import test from "node:test";
import {
  computeVirtualWindow,
  describeFilteredEnabledSummary,
  describeSelectedFilterSummary,
  parseSourceTags,
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
    bookSourceGroup: "男频,笔趣阁",
    enabled: true,
  },
  {
    bookSourceUrl: "https://example.com/direct-b.json",
    bookSourceName: "直连-B",
    bookSourceGroup: "女频,漫画",
    enabled: false,
  },
  {
    bookSourceUrl: "https://example.com/sub-a.json",
    bookSourceName: "订阅-A",
    bookSourceGroup: "精选,漫画",
    subscriptionUrl: "https://sub.example.com/all.json",
    enabled: true,
  },
  {
    bookSourceUrl: "https://example.com/sub-b.json",
    bookSourceName: "订阅-B",
    bookSourceGroup: "精选,笔趣阁",
    subscriptionUrl: "https://sub.example.com/all.json",
    enabled: false,
  },
];

test("parseSourceTags splits comma-separated labels and removes duplicates", () => {
  assert.equal(
    JSON.stringify(parseSourceTags("笔趣阁, 漫画，精选,漫画")),
    JSON.stringify(["笔趣阁", "漫画", "精选"]),
  );
  assert.equal(JSON.stringify(parseSourceTags("")), JSON.stringify([]));
});

test("describeFilteredEnabledSummary respects tag and availability filters", () => {
  const availabilityResults = new Map([
    ["https://example.com/direct-a.json", { sourceUrl: "https://example.com/direct-a.json", available: true, testedAt: "1" }],
    ["https://example.com/direct-b.json", { sourceUrl: "https://example.com/direct-b.json", available: false, testedAt: "1" }],
    ["https://example.com/sub-a.json", { sourceUrl: "https://example.com/sub-a.json", available: true, testedAt: "1" }],
    ["https://example.com/sub-b.json", { sourceUrl: "https://example.com/sub-b.json", available: true, testedAt: "1" }],
  ]);

  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, "笔趣阁", "all", availabilityResults),
    "启用:1 可用:2 全部:2",
  );
  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, "漫画", "available", availabilityResults),
    "启用:1 可用:1 全部:1",
  );
  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, "__enabled", "all", availabilityResults),
    "启用:2 可用:2 全部:2",
  );
  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, "__available", "all", availabilityResults),
    "启用:2 可用:3 全部:3",
  );
  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, ["__enabled", "漫画"], "all", availabilityResults),
    "启用:1 可用:1 全部:1",
  );
  assert.equal(
    describeFilteredEnabledSummary(MOCK_SOURCES, ["__available", "笔趣阁"], "all", availabilityResults),
    "启用:1 可用:2 全部:2",
  );
  assert.equal(
    describeFilteredEnabledSummary(
      [...MOCK_SOURCES, { bookSourceUrl: "https://example.com/untagged.json", bookSourceName: "未标记书源", enabled: true }],
      "__untagged",
      "all",
      availabilityResults,
    ),
    "启用:1 可用:0 全部:1",
  );
});

test("describeSelectedFilterSummary formats active multi-select filters", () => {
  assert.equal(describeSelectedFilterSummary([]), "");
  assert.equal(describeSelectedFilterSummary(["__enabled"]), "启用");
  assert.equal(describeSelectedFilterSummary(["__enabled", "漫画"]), "启用 + 漫画");
  assert.equal(describeSelectedFilterSummary(["__available", "__enabled", "笔趣阁"]), "可用 + 启用 + 笔趣阁");
  assert.equal(describeSelectedFilterSummary(["__untagged"]), "未标记");
});

test("computeVirtualWindow returns overscanned slice bounds", () => {
  assert.equal(
    JSON.stringify(computeVirtualWindow(100, 240, 480)),
    JSON.stringify({
      startIndex: 0,
      endIndex: 10,
      offsetTop: 0,
      offsetBottom: 8640,
    }),
  );

  assert.equal(
    JSON.stringify(computeVirtualWindow(100, 960, 480)),
    JSON.stringify({
      startIndex: 8,
      endIndex: 18,
      offsetTop: 768,
      offsetBottom: 7872,
    }),
  );
});

test("describeBookSourceTree renders virtual list shells instead of all source rows", () => {
  const manySources = Array.from({ length: 120 }, (_, index) => ({
    bookSourceUrl: `https://example.com/source-${index}.json`,
    bookSourceName: `超大书源-${index}`,
    bookSourceGroup: "海量",
    enabled: index % 2 === 0,
  }));

  const html = describeBookSourceTree(manySources);

  assert.equal(html.includes("data-source-virtual-list"), true, "should render virtual list shell");
  assert.equal(html.includes("source-virtual-canvas"), true, "should render virtual list canvas");
  assert.equal(html.includes("超大书源-119"), false, "should not inline offscreen source rows");
  assert.equal(html.includes('data-total-count="120"'), true, "should expose group size for virtualization");
});

test("describeBookSourceTree renders direct and subscription tiers", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("本地书源"), true, "should render direct tier");
  assert.equal(html.includes("订阅源"), true, "should render subscription tier");
  assert.equal(html.includes("https://sub.example.com/all.json"), true, "should render subscription URL");
  assert.equal(html.includes("笔趣阁"), true, "should render split tag label");
  assert.equal(html.includes("漫画"), true, "should render second split tag label");
});

test("describeBookSourceTree renders tag filter bar and subscription bulk toggles", () => {
  const html = describeBookSourceTree([
    ...MOCK_SOURCES,
    { bookSourceUrl: "https://example.com/untagged.json", bookSourceName: "未标记书源", enabled: true },
  ]);

  assert.equal(html.includes("全部标签"), true, "should render all-tags option");
  assert.equal(html.includes("已选 0 项"), true, "should render selected-filter counter");
  assert.equal(html.includes('data-tag-filter="__enabled"'), true, "should render enabled special filter");
  assert.equal(html.includes('data-tag-filter="__available"'), true, "should render available special filter");
  assert.equal(html.includes('data-tag-filter="__untagged"'), true, "should render untagged special filter");
  assert.equal(html.includes('data-tag-filter="笔趣阁"'), true, "should render tag filter hook");
  assert.equal(html.includes("启用订阅"), true, "should render subscription-level enable toggle");
  assert.equal(html.includes("data-bulk-toggle"), true, "should render bulk toggle hooks");
});

test("describeBookSourceTree shows enabled summaries at multiple levels", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("启用:1 可用:0 全部:2"), true, "should render summary chips");
  assert.equal(html.includes('data-total-count="2"'), true, "should expose virtual group sizes");
});

test("describeBookSourceTree renders quick actions and tag-aware virtualization hooks", () => {
  const html = describeBookSourceTree(MOCK_SOURCES);

  assert.equal(html.includes("测试可用性"), true, "should render availability test action");
  assert.equal(html.includes("测试此层"), true, "should render tier-level availability action");
  assert.equal(html.includes("测试订阅"), true, "should render subscription-level availability action");
  assert.equal(html.includes("禁用不可用"), true, "should render disable unavailable action");
  assert.equal(html.includes("启用全部"), true, "should render enable all action");
  assert.equal(html.includes("删除已禁用"), true, "should render delete disabled action");
  assert.equal(html.includes("开发专用：删除全部"), true, "should render dev delete all action");
  assert.equal(html.includes("data-availability-test"), true, "should render scoped availability hooks");
  assert.equal(html.includes("data-source-virtual-list"), true, "should render source virtualization hooks");
  assert.equal(html.includes("source-tag-chip"), true, "should render row tag chips in virtualized content shell");
  assert.equal(html.includes("source-tag-chip--status"), true, "should render special status tags");
  assert.equal(html.includes("data-availability-status"), true, "should keep availability update hooks");
});

test("describeBookSourceTree renders enabled and available as leading special tags", () => {
  const html = describeBookSourceTree([
    {
      bookSourceUrl: "https://example.com/special.json",
      bookSourceName: "特殊标签书源",
      bookSourceGroup: "笔趣阁,漫画",
      enabled: true,
      lastTestAvailable: true,
      lastTestedAt: "2026-04-18T12:00:00.000Z",
    },
  ]);

  assert.equal(/已启用[\s\S]*可用[\s\S]*笔趣阁/.test(html), true, "special tags should lead normal tags");
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
  assert.equal(html.includes("&lt;script&gt;alert('xss')&lt;/script&gt;"), true, "should keep escaped script text");
  assert.equal(html.includes("&lt;x&gt;"), true, "should escape subscription URL");
});
