import assert from "node:assert/strict";
import test from "node:test";
import {
  describeSearchSourceOptions,
  resolveSearchSourceSelection,
} from "./Search.ts";
import type { LegacyBookSource } from "../types.ts";

const MOCK_SOURCES: LegacyBookSource[] = [
  {
    bookSourceUrl: "https://direct-a.example",
    bookSourceName: "直连-A",
    bookSourceGroup: "男频",
    enabled: true,
  },
  {
    bookSourceUrl: "https://direct-b.example",
    bookSourceName: "直连-B",
    bookSourceGroup: "女频",
    enabled: true,
  },
  {
    bookSourceUrl: "https://sub-a.example",
    bookSourceName: "订阅-A",
    bookSourceGroup: "精选",
    subscriptionUrl: "https://sub.example/all.json",
    enabled: true,
  },
  {
    bookSourceUrl: "https://sub-b.example",
    bookSourceName: "订阅-B",
    bookSourceGroup: "精选",
    subscriptionUrl: "https://sub.example/all.json",
    enabled: false,
  },
];

test("describeSearchSourceOptions renders group and subscription parents before leaves", () => {
  const html = describeSearchSourceOptions(MOCK_SOURCES);

  assert.equal(html.includes("分组：男频"), true);
  assert.equal(html.includes("分组：女频"), true);
  assert.equal(html.includes("订阅：https://sub.example/all.json"), true);
  assert.equal(html.includes('value="group:男频"'), true);
  assert.equal(html.includes('value="subscription:https://sub.example/all.json"'), true);
  assert.equal(html.includes('value="source:https://direct-a.example"'), true);
});

test("resolveSearchSourceSelection expands group and subscription parents to enabled sources", () => {
  const byGroup = resolveSearchSourceSelection("group:男频", MOCK_SOURCES);
  assert.equal(byGroup.length, 1);
  assert.equal(byGroup[0]?.bookSourceUrl, "https://direct-a.example");

  const bySubscription = resolveSearchSourceSelection(
    "subscription:https://sub.example/all.json",
    MOCK_SOURCES,
  );
  assert.equal(bySubscription.length, 1, "disabled children should be excluded");
  assert.equal(bySubscription[0]?.bookSourceUrl, "https://sub-a.example");

  const bySource = resolveSearchSourceSelection("source:https://direct-b.example", MOCK_SOURCES);
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0]?.bookSourceUrl, "https://direct-b.example");
});
