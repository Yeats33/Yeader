import assert from "node:assert/strict";
import test from "node:test";
import {
  describeSearchSourceFilters,
  parseSearchSourceTags,
  resolveSearchSourceSelection,
  resolveSearchSources,
} from "./Search.ts";
import type { LegacyBookSource } from "../types.ts";

const MOCK_SOURCES: LegacyBookSource[] = [
  {
    bookSourceUrl: "https://direct-a.example",
    bookSourceName: "直连-A",
    bookSourceGroup: "男频,笔趣阁",
    enabled: true,
  },
  {
    bookSourceUrl: "https://direct-b.example",
    bookSourceName: "直连-B",
    bookSourceGroup: "女频,漫画",
    enabled: true,
  },
  {
    bookSourceUrl: "https://sub-a.example",
    bookSourceName: "订阅-A",
    bookSourceGroup: "精选,漫画",
    subscriptionUrl: "https://sub.example/all.json",
    enabled: true,
  },
  {
    bookSourceUrl: "https://sub-b.example",
    bookSourceName: "订阅-B",
    bookSourceGroup: "精选,笔趣阁",
    subscriptionUrl: "https://sub.example/all.json",
    enabled: false,
  },
  {
    bookSourceUrl: "https://untagged.example",
    bookSourceName: "未标记书源",
    enabled: true,
  },
];

test("parseSearchSourceTags splits comma-separated labels and removes duplicates", () => {
  assert.equal(
    JSON.stringify(parseSearchSourceTags("笔趣阁, 漫画，精选,漫画")),
    JSON.stringify(["笔趣阁", "漫画", "精选"]),
  );
});

test("describeSearchSourceFilters renders distinct tag and source groups", () => {
  const html = describeSearchSourceFilters(MOCK_SOURCES);

  assert.equal(html.includes("全部标签"), true);
  assert.equal(html.includes("全部书源"), true);
  assert.equal(html.includes("按标签筛选书源"), true);
  assert.equal(html.includes("选择具体书源"), true);
  assert.equal(html.includes('data-search-tag-value="tag:笔趣阁"'), true);
  assert.equal(html.includes('data-search-tag-value="tag:__untagged"'), true);
  assert.equal(html.includes("标签：未标记"), true);
  assert.equal(html.includes("标签：笔趣阁"), true);
  assert.equal(html.includes("标签：漫画"), true);
  assert.equal(html.includes("标签：精选"), true);
  assert.equal(html.includes('data-search-source-value="source:https://direct-a.example"'), true);
  assert.equal(html.includes('data-search-source-value="source:https://sub-b.example"'), false, "disabled sources should not be listed");
});

test("resolveSearchSourceSelection expands tag parents to enabled sources", () => {
  const byTag = resolveSearchSourceSelection("tag:漫画", MOCK_SOURCES);
  assert.equal(byTag.length, 2);
  assert.equal(byTag[0]?.bookSourceUrl, "https://direct-b.example");
  assert.equal(byTag[1]?.bookSourceUrl, "https://sub-a.example");

  const bySource = resolveSearchSourceSelection("source:https://direct-b.example", MOCK_SOURCES);
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0]?.bookSourceUrl, "https://direct-b.example");

  const byUntagged = resolveSearchSourceSelection("tag:__untagged", MOCK_SOURCES);
  assert.equal(byUntagged.length, 1);
  assert.equal(byUntagged[0]?.bookSourceUrl, "https://untagged.example");
});

test("resolveSearchSources treats tag filtering and source selection as separate concerns", () => {
  const byTagOnly = resolveSearchSources("tag:漫画", "", MOCK_SOURCES);
  assert.equal(byTagOnly.length, 2);
  assert.equal(byTagOnly[0]?.bookSourceUrl, "https://direct-b.example");
  assert.equal(byTagOnly[1]?.bookSourceUrl, "https://sub-a.example");

  const bySpecificSource = resolveSearchSources("tag:漫画", "source:https://direct-b.example", MOCK_SOURCES);
  assert.equal(bySpecificSource.length, 1);
  assert.equal(bySpecificSource[0]?.bookSourceUrl, "https://direct-b.example");

  const allEnabled = resolveSearchSources("", "", MOCK_SOURCES);
  assert.equal(allEnabled.length, 4);
});
