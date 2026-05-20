import assert from "node:assert/strict";
import test from "node:test";
import {
  contentResultFromSearchResult,
  contentSourceFromYeaderSource,
  filterContentSources,
  libraryItemFromBook,
  sourceKindLabel,
} from "./viewModels.ts";
import {
  getBundledPluginRegistryPreview,
  identityVerificationLabel,
  parsePluginRegistry,
  pluginRegistryEntries,
  pluginRiskLabels,
  summarizePluginActivation,
  type PluginRegistryEntry,
} from "./pluginMarket.ts";

test("libraryItemFromBook maps local EPUB into a local library item", () => {
  const item = libraryItemFromBook({
    url: "local://epub/book.epub",
    name: "Local Book",
    author: "Author",
    source_url: "local://epub",
    reading_progress: 2,
    reading_chapter: "Chapter",
  });

  assert.equal(item.id, "local://epub/book.epub");
  assert.equal(item.title, "Local Book");
  assert.equal(item.creator, "Author");
  assert.equal(item.kind, "local-file");
  assert.equal(item.progressLabel, "阅读至第 2 项 · Chapter");
});

test("contentResultFromSearchResult keeps source and URL identity stable", () => {
  const result = contentResultFromSearchResult({
    source_id: "source-a",
    name: "Entry",
    author: "Byline",
    book_url: "https://example.com/entry",
    intro: "Summary",
    kind: "Article",
    last_chapter: "Latest",
  });

  assert.equal(result.id, "source-a|https://example.com/entry");
  assert.equal(result.title, "Entry");
  assert.equal(result.creator, "Byline");
  assert.equal(result.category, "Article");
  assert.equal(result.latestEntry, "Latest");
});

test("contentSourceFromYeaderSource labels RSS and rule-source capabilities", () => {
  const rss = contentSourceFromYeaderSource({
    id: "rss-a",
    name: "RSS A",
    mediaType: "rss",
    enabled: true,
    capabilities: [{ kind: "feed" }],
  });
  const rule = contentSourceFromYeaderSource({
    id: "rule-a",
    name: "Rule A",
    mediaType: "generic",
    enabled: true,
    capabilities: [{ kind: "search" }, { kind: "content" }],
  });

  assert.equal(rss.kind, "rss");
  assert.deepEqual(rss.capabilityLabels, ["订阅"]);
  assert.equal(rule.kind, "rule-source");
  assert.deepEqual(rule.capabilityLabels, ["搜索", "正文"]);
});

test("filterContentSources supports source management kind tabs", () => {
  const sources = [
    contentSourceFromYeaderSource({
      id: "rss-a",
      name: "RSS A",
      mediaType: "rss",
      enabled: true,
      capabilities: [{ kind: "feed" }],
    }),
    contentSourceFromYeaderSource({
      id: "rule-a",
      name: "Rule A",
      mediaType: "generic",
      enabled: true,
      capabilities: [{ kind: "search" }],
    }),
  ];

  assert.equal(filterContentSources(sources, "all").length, 2);
  assert.equal(filterContentSources(sources, "rss")[0]?.id, "rss-a");
  assert.equal(filterContentSources(sources, "rule-source")[0]?.id, "rule-a");
  assert.equal(filterContentSources(sources, "plugin").length, 0);
  assert.equal(sourceKindLabel("legacy"), "Legacy");
});

test("plugin activation summaries distinguish free and token-gated plugins", () => {
  assert.deepEqual(summarizePluginActivation({ mode: "free" }), {
    label: "免费",
    loginRequired: false,
    detail: "无需登录即可启用",
  });

  const plugin: PluginRegistryEntry = {
    id: "example.paid",
    name: "Paid",
    version: "0.1.0",
    description: "Paid example",
    license: "MIT",
    sourceRepo: "https://example.com/plugin",
    identity: {
      chain: "evm",
      address: "0x0000000000000000000000000000000000000000",
      verification: "signature-pending",
      proof: "",
    },
    donations: [],
    activation: {
      mode: "token-transfer",
      token: {
        chain: "evm",
        chainId: 1,
        standard: "erc20",
        contract: "0x0000000000000000000000000000000000000000",
        symbol: "TOKEN",
        decimals: 18,
        minAmount: "10.0",
        recipient: "0x0000000000000000000000000000000000000000",
        verification: "onchain-transfer",
        loginRequired: true,
      },
    },
    releaseUrl: "https://example.com/plugin.tar.gz",
    sha256: "0".repeat(64),
    runtime: "wasm32-wasip1",
    capabilities: ["feed"],
    network: ["https://example.com/*"],
    risk: {
      requiresLogin: false,
      touchesPaidContent: false,
      usesAntiBotWorkarounds: false,
      requiresBrowserRendering: false,
    },
    review: {
      status: "example",
      notes: "Example",
    },
  };

  const summary = summarizePluginActivation(plugin.activation);
  assert.equal(summary.label, "Token 启用");
  assert.equal(summary.loginRequired, true);
  assert.equal(summary.detail, "EVM 1 · 10.0 TOKEN · 0x0000000000000000000000000000000000000000");
  assert.equal(identityVerificationLabel(plugin.identity.verification), "待验证");
});

test("bundled plugin registry preview covers free and token activation previews", () => {
  const registryView = getBundledPluginRegistryPreview();
  const entries = pluginRegistryEntries(registryView);

  assert.equal(registryView.registry.format, "yeader.plugin-registry");
  assert.equal(registryView.sourceLabel, "Yeats33/YeaderPlugins");
  assert.equal(registryView.sourceUrl, "https://github.com/Yeats33/YeaderPlugins");
  assert.equal(registryView.readonly, true);
  assert.equal(registryView.installAvailable, false);
  assert.equal(entries.length, 2);

  const free = entries.find((plugin) => plugin.activation.mode === "free");
  const paid = entries.find((plugin) => plugin.activation.mode === "token-transfer");

  assert.equal(free?.id, "example.news");
  assert.equal(paid?.id, "example.paid-news");
  assert.equal(paid?.activation.mode, "token-transfer");
  assert.deepEqual(pluginRiskLabels(free!.risk), []);
});

test("parsePluginRegistry rejects values outside the registry envelope", () => {
  const registryView = getBundledPluginRegistryPreview();

  assert.deepEqual(parsePluginRegistry(registryView.registry), registryView.registry);
  assert.equal(parsePluginRegistry(null), null);
  assert.equal(parsePluginRegistry({ format: "other", version: 1, plugins: [] }), null);
  assert.equal(parsePluginRegistry({ format: "yeader.plugin-registry", version: "1", plugins: [] }), null);
  assert.equal(parsePluginRegistry({ format: "yeader.plugin-registry", version: 1, plugins: {} }), null);
});
