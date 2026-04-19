import {
  deleteBookSources,
  deleteDisabledBookSources,
  enableAllBookSources,
  listBookSources,
  listReplaceRules,
  deleteBookSource,
  setBookSourcesEnabled,
  testBookSourcesAvailability,
  toggleBookSource,
  importBackup,
  loadBookSourcesFromFile,
  importBookSourcesJson,
  importBookSourcesUrl,
  importBookSourcesSubscription,
  getDevModeStatus,
  toggleDevMode,
  getLogLines,
  openLogFile,
} from "../api.ts";
import { navigate } from "../router.ts";
import { $ } from "../query.ts";
import type {
  BookSourceAvailability,
  LegacyBookSource,
  LegacyReplaceRule,
} from "../types.ts";
import {
  getCurrentTheme,
  setCurrentTheme,
  getColorMode,
  toggleColorMode,
  getCustomCss,
  setCustomCss,
  describeThemeOptions,
  type ThemeName,
} from "../theme.ts";

type PersistedBookSourceAvailability = BookSourceAvailability & {
  testedAt: string;
};

type PersistedBookSourceAvailabilityMap = Record<string, PersistedBookSourceAvailability>;

type VirtualWindow = {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  offsetBottom: number;
};

const SOURCE_ROW_HEIGHT = 96;
const SOURCE_ROW_OVERSCAN = 2;
const SOURCE_LIST_MAX_VISIBLE_ROWS = 6;
const SPECIAL_TAG_ENABLED = "__enabled";
const SPECIAL_TAG_AVAILABLE = "__available";
const SPECIAL_TAG_UNTAGGED = "__untagged";

const sourceListRegistry = new Map<string, LegacyBookSource[]>();
let sourceListSequence = 0;
let latestBookSourcesSnapshot: LegacyBookSource[] = [];

function resetSourceListRegistry(): void {
  sourceListRegistry.clear();
  sourceListSequence = 0;
}

function registerSourceList(sources: LegacyBookSource[]): string {
  const listId = `source-list-${sourceListSequence}`;
  sourceListSequence += 1;
  sourceListRegistry.set(listId, sources);
  return listId;
}

function replaceBookSourceSnapshot(bookSources: LegacyBookSource[]): LegacyBookSource[] {
  latestBookSourcesSnapshot = bookSources.map((source) => ({ ...source }));
  return latestBookSourcesSnapshot;
}

function applyAvailabilityToSourceSnapshot(status: PersistedBookSourceAvailability): void {
  const source = latestBookSourcesSnapshot.find((item) => item.bookSourceUrl === status.sourceUrl);
  if (!source) {
    return;
  }

  source.lastTestAvailable = status.available;
  source.lastTestedAt = status.testedAt;
  source.lastTestDetail = status.detail;
}

function getFilteredSources(
  sources: LegacyBookSource[],
  filterMode: string,
  selectedTags: string | string[],
  availabilityResults: Map<string, PersistedBookSourceAvailability>,
): LegacyBookSource[] {
  const selectedFilters = Array.isArray(selectedTags)
    ? selectedTags.filter(Boolean)
    : selectedTags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

  return sources.filter((source) => {
    if (filterMode === "available" && !availabilityResults.get(source.bookSourceUrl)?.available) {
      return false;
    }

    for (const selectedTag of selectedFilters) {
      if (selectedTag === SPECIAL_TAG_ENABLED && !source.enabled) {
        return false;
      }

      if (selectedTag === SPECIAL_TAG_AVAILABLE && !availabilityResults.get(source.bookSourceUrl)?.available) {
        return false;
      }

      if (selectedTag === SPECIAL_TAG_UNTAGGED && getSourceTags(source).length > 0) {
        return false;
      }

      if (
        selectedTag !== SPECIAL_TAG_ENABLED
        && selectedTag !== SPECIAL_TAG_AVAILABLE
        && selectedTag !== SPECIAL_TAG_UNTAGGED
        && !getSourceTags(source).includes(selectedTag)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function describeFilteredEnabledSummary(
  sources: LegacyBookSource[],
  selectedTags: string | string[],
  filterMode: string,
  availabilityResults: Map<string, PersistedBookSourceAvailability>,
): string {
  const filteredSources = getFilteredSources(sources, filterMode, selectedTags, availabilityResults);
  const enabledCount = filteredSources.filter((source) => source.enabled).length;
  const availableCount = filteredSources.filter(
    (source) => availabilityResults.get(source.bookSourceUrl)?.available,
  ).length;
  return `启用:${enabledCount} 可用:${availableCount} 全部:${filteredSources.length}`;
}

export function describeSelectedFilterSummary(selectedTags: string[]): string {
  return selectedTags
    .map((tag) => {
      if (tag === SPECIAL_TAG_AVAILABLE) {
        return "可用";
      }
      if (tag === SPECIAL_TAG_ENABLED) {
        return "启用";
      }
      if (tag === SPECIAL_TAG_UNTAGGED) {
        return "未标记";
      }
      return tag;
    })
    .join(" + ");
}

function getViewportHeight(itemCount: number): number {
  return Math.max(SOURCE_ROW_HEIGHT, Math.min(itemCount, SOURCE_LIST_MAX_VISIBLE_ROWS) * SOURCE_ROW_HEIGHT);
}

export function parseSourceTags(rawValue?: string): string[] {
  if (!rawValue) {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  rawValue
    .split(/[,\uff0c]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((tag) => {
      if (seen.has(tag)) {
        return;
      }
      seen.add(tag);
      tags.push(tag);
    });

  return tags;
}

export function computeVirtualWindow(
  totalCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = SOURCE_ROW_HEIGHT,
  overscan: number = SOURCE_ROW_OVERSCAN,
): VirtualWindow {
  if (totalCount <= 0 || viewportHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      offsetBottom: 0,
    };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const startIndex = Math.max(0, Math.floor(safeScrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.floor((safeScrollTop + viewportHeight) / rowHeight) + overscan + 1,
  );

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    offsetBottom: Math.max(0, (totalCount - endIndex) * rowHeight),
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getSourceTags(source: LegacyBookSource): string[] {
  return parseSourceTags(source.bookSourceGroup);
}

function getSubscriptionUrl(source: LegacyBookSource): string | null {
  const value = source.subscriptionUrl?.trim();
  return value ? value : null;
}

function collectSourceTags(sources: LegacyBookSource[]): string[] {
  const tags = new Set<string>();

  sources.forEach((source) => {
    getSourceTags(source).forEach((tag) => {
      tags.add(tag);
    });
  });

  return Array.from(tags).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function hasUntaggedSources(sources: LegacyBookSource[]): boolean {
  return sources.some((source) => getSourceTags(source).length === 0);
}

function describeEnabledSummary(sources: LegacyBookSource[]): string {
  const enabledCount = sources.filter((source) => source.enabled).length;
  const tested = sources.filter((s) => typeof s.lastTestAvailable === "boolean");
  const availableCount = tested.filter((s) => s.lastTestAvailable).length;
  return `启用:${enabledCount} 可用:${availableCount} 全部:${sources.length}`;
}

function describeSummaryChip(sources: LegacyBookSource[]): string {
  const encodedUrls = escapeAttr(JSON.stringify(sources.map((source) => source.bookSourceUrl)));
  return `
    <span class="source-summary-wrap">
      <span class="source-summary-chip available" data-source-summary="${encodedUrls}">${describeEnabledSummary(sources)}</span>
      <span class="source-summary-filter" data-source-summary-filter hidden></span>
    </span>
  `;
}

export function describeLastTestedText(testedAt: string, now: Date = new Date()): string {
  const epochSeconds = Number(testedAt);
  const date = Number.isFinite(epochSeconds) && /^\d+$/.test(testedAt)
    ? new Date(epochSeconds * 1000)
    : new Date(testedAt);
  if (Number.isNaN(date.getTime())) {
    return `测于 ${testedAt}`;
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const timeText = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");

  if (diffMinutes >= 0 && diffMinutes < 1) {
    return "刚刚测试";
  }

  if (diffMinutes >= 1 && diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const sameDay = now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate();
  if (sameDay) {
    return `今天 ${timeText}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.getFullYear() === date.getFullYear()
    && yesterday.getMonth() === date.getMonth()
    && yesterday.getDate() === date.getDate();
  if (isYesterday) {
    return `昨天 ${timeText}`;
  }

  if (now.getFullYear() === date.getFullYear()) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${timeText}`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${timeText}`;
}

export function mergeAvailabilityResults(
  existing: PersistedBookSourceAvailabilityMap,
  statuses: BookSourceAvailability[],
  testedAt: string,
): PersistedBookSourceAvailabilityMap {
  const merged: PersistedBookSourceAvailabilityMap = { ...existing };

  for (const status of statuses) {
    merged[status.sourceUrl] = {
      ...status,
      testedAt,
    };
  }

  return merged;
}

export async function runAvailabilityChecksIncrementally(
  sourceUrls: string[],
  tester: (sourceUrl: string) => Promise<BookSourceAvailability>,
  onResult: (status: BookSourceAvailability) => void,
  onProgress: (text: string) => void,
): Promise<BookSourceAvailability[]> {
  const results: BookSourceAvailability[] = [];
  const total = sourceUrls.length;

  for (let i = 0; i < sourceUrls.length; i++) {
    const sourceUrl = sourceUrls[i];
    onProgress(`测试中 (${i + 1}/${total})`);
    const status = await tester(sourceUrl);
    results.push(status);
    onResult(status);
  }

  return results;
}

export function getSourceDeleteButtonLabel(isPending: boolean): string {
  return isPending ? "确认删除" : "删除";
}

export function getDeleteAllButtonLabel(isPending: boolean): string {
  return isPending ? "确认删除全部" : "开发专用：删除全部";
}

function describeSubscriptionRefreshButton(sources: LegacyBookSource[], subscriptionUrl: string): string {
  const encodedUrls = escapeAttr(JSON.stringify(sources.map((s) => s.bookSourceUrl)));

  return `
    <button
      type="button"
      class="btn-toggle"
      data-subscription-refresh="true"
      data-subscription-url="${escapeAttr(subscriptionUrl)}"
      data-source-urls="${encodedUrls}"
    >
      更新订阅
    </button>
  `;
}

function describeBulkToggleButton(
  scope: "group" | "subscription",
  sources: LegacyBookSource[],
): string {
  const allEnabled = sources.every((source) => source.enabled);
  const label = allEnabled
    ? (scope === "group" ? "禁用本组" : "禁用订阅")
    : (scope === "group" ? "启用本组" : "启用订阅");
  const encodedUrls = escapeAttr(JSON.stringify(sources.map((source) => source.bookSourceUrl)));

  return `
    <button
      type="button"
      class="btn-toggle ${allEnabled ? "active" : ""}"
      data-bulk-toggle="${scope}"
      data-enabled="${allEnabled ? "true" : "false"}"
      data-source-urls="${encodedUrls}"
    >
      ${label}
    </button>
  `;
}

function describeAvailabilityTestButton(
  label: string,
  sources: LegacyBookSource[],
): string {
  const encodedUrls = escapeAttr(JSON.stringify(sources.map((source) => source.bookSourceUrl)));

  return `
    <button
      type="button"
      class="btn-secondary"
      data-availability-test="true"
      data-source-urls="${encodedUrls}"
      data-label="${escapeAttr(label)}"
    >
      ${label}
    </button>
  `;
}

function getSourceAvailabilityState(source: LegacyBookSource): PersistedBookSourceAvailability | null {
  if (typeof source.lastTestAvailable !== "boolean" || !source.lastTestedAt) {
    return null;
  }

  return {
    sourceUrl: source.bookSourceUrl,
    available: source.lastTestAvailable,
    detail: source.lastTestDetail,
    testedAt: source.lastTestedAt,
  };
}

function describeSourceItems(sources: LegacyBookSource[]): string {
  return sources
    .map((source) => {
      const url = escapeAttr(source.bookSourceUrl);
      const name = escapeText(source.bookSourceName ?? "");
      const tags = getSourceTags(source);
      const sourceUrl = escapeText(source.bookSourceUrl);
      const stateLabel = source.enabled ? "已启用" : "已禁用";
      const availabilityState = getSourceAvailabilityState(source);
      const availabilityLabel = availabilityState
        ? (availabilityState.available ? "可用" : "不可用")
        : "未测试";
      const availabilityClass = availabilityState
        ? (availabilityState.available ? "available" : "unavailable")
        : "pending";
      const availabilityTitle = availabilityState
        ? escapeAttr(
            availabilityState.detail
              ? `${describeLastTestedText(availabilityState.testedAt)} · ${availabilityState.detail}`
              : describeLastTestedText(availabilityState.testedAt),
          )
        : "";
      const lastTestedText = availabilityState ? describeLastTestedText(availabilityState.testedAt) : "";
      const availabilityTag = `
        <span
          class="source-tag-chip source-tag-chip--status source-tag-chip--availability ${availabilityClass}"
          data-availability-status
          data-source-url="${url}"
          title="${availabilityTitle}"
        >${availabilityLabel}</span>
      `;
      const enabledTag = `
        <span class="source-tag-chip source-tag-chip--status ${source.enabled ? "source-tag-chip--enabled" : "source-tag-chip--disabled"}">
          ${stateLabel}
        </span>
      `;
      const normalTagHtml = tags.length > 0
        ? tags.map((tag) => `<span class="source-tag-chip">${escapeText(tag)}</span>`).join("")
        : '<span class="source-tag-chip is-muted">未标记</span>';

      return `
        <div class="source-item source-row" data-url="${url}">
          <div class="source-item-main">
            <div class="source-item-header">
              <strong class="source-item-name">${name}</strong>
            </div>
            <div class="source-item-meta">
              <span class="source-tag-list">${enabledTag}${availabilityTag}${normalTagHtml}</span>
              <code>${sourceUrl}</code>
              <span class="source-last-tested" data-last-tested data-source-url="${url}">${escapeText(lastTestedText)}</span>
            </div>
          </div>
          <div class="source-item-actions">
            ${describeAvailabilityTestButton("测试书源", [source])}
            <button class="btn-toggle ${source.enabled ? "active" : ""}" data-toggle="source" data-url="${url}">
              ${source.enabled ? "启用" : "禁用"}
            </button>
            <button class="btn-danger" data-delete="source" data-url="${url}">${getSourceDeleteButtonLabel(false)}</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function describeVirtualSourceList(listId: string, sources: LegacyBookSource[]): string {
  const totalCount = sources.length;
  const viewportHeight = getViewportHeight(totalCount || 1);
  const initialWindow = computeVirtualWindow(totalCount, 0, viewportHeight);
  const initialSources = sources.slice(initialWindow.startIndex, initialWindow.endIndex);

  return `
    <div
      class="source-item-list source-item-virtual-list"
      data-source-virtual-list="${escapeAttr(listId)}"
      data-total-count="${String(totalCount)}"
      data-row-height="${String(SOURCE_ROW_HEIGHT)}"
      style="height:${viewportHeight}px;"
    >
      <div class="source-virtual-canvas" style="height:${String(totalCount * SOURCE_ROW_HEIGHT)}px;">
        <div class="source-virtual-items" style="transform: translateY(${String(initialWindow.offsetTop)}px);">
          ${describeSourceItems(initialSources)}
        </div>
      </div>
    </div>
  `;
}

function describeTagFilterBar(tags: string[]): string {
  const untaggedChip = hasUntaggedSources(latestBookSourcesSnapshot)
    ? `<button class="source-tag-filter source-tag-filter--special" data-tag-filter="${SPECIAL_TAG_UNTAGGED}">未标记</button>`
    : "";

  return `
    <div class="source-tag-filters" id="source-tag-filters">
      <div class="source-filter-status" id="source-filter-status">已选 0 项</div>
      <button class="source-tag-filter active" data-tag-filter="">全部标签</button>
      <button class="source-tag-filter source-tag-filter--special" data-tag-filter="${SPECIAL_TAG_ENABLED}">启用</button>
      <button class="source-tag-filter source-tag-filter--special" data-tag-filter="${SPECIAL_TAG_AVAILABLE}">可用</button>
      ${untaggedChip}
      ${tags.map((tag) => `
        <button class="source-tag-filter" data-tag-filter="${escapeAttr(tag)}">${escapeText(tag)}</button>
      `).join("")}
    </div>
  `;
}

function parseSelectedTagFilters(rawValue?: string): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as string[];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function describeSourceListSection(
  title: string,
  sources: LegacyBookSource[],
  extraActions: string = "",
): string {
  const listId = registerSourceList(sources);

  return `
    <section class="source-list-card">
      <div class="source-list-card-header">
        <span class="source-list-card-title">${escapeText(title)}</span>
        ${describeSummaryChip(sources)}
        <span class="source-summary-actions">
          ${describeAvailabilityTestButton("测试此层", sources)}
          ${extraActions}
        </span>
      </div>
      ${describeVirtualSourceList(listId, sources)}
    </section>
  `;
}

export function describeBookSourceTree(bookSources: LegacyBookSource[]): string {
  if (bookSources.length === 0) {
    return '<p class="empty-state">暂无书源</p>';
  }

  resetSourceListRegistry();
  const snapshot = replaceBookSourceSnapshot(bookSources);
  const allTags = collectSourceTags(snapshot);

  const directSources: LegacyBookSource[] = [];
  const subscriptionSources = new Map<string, LegacyBookSource[]>();

  for (const source of snapshot) {
    const subscriptionUrl = getSubscriptionUrl(source);
    if (subscriptionUrl) {
      const bucket = subscriptionSources.get(subscriptionUrl) ?? [];
      bucket.push(source);
      subscriptionSources.set(subscriptionUrl, bucket);
      continue;
    }
    directSources.push(source);
  }

  const sections: string[] = [];

  if (directSources.length > 0) {
    sections.push(`
      <details class="source-tier" data-tier="local">
        <summary class="source-tier-summary">
          <span class="source-tier-title">本地书源</span>
          ${describeSummaryChip(directSources)}
          <span class="source-summary-actions">
            ${describeAvailabilityTestButton("测试此层", directSources)}
          </span>
        </summary>
        <div class="source-tier-body">
          ${describeSourceListSection("本地书源列表", directSources)}
        </div>
      </details>
    `);
  }

  if (subscriptionSources.size > 0) {
    const allSubscriptionSources = Array.from(subscriptionSources.values()).flat();
    const subscriptionNodes = Array.from(subscriptionSources.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([subscriptionUrl, groupedSources]) => `
        <section class="source-subscription" data-subscription-url="${escapeAttr(subscriptionUrl)}">
          <div class="source-subscription-summary">
            <span class="source-subscription-title">订阅链接</span>
            <code class="source-subscription-url">${escapeText(subscriptionUrl)}</code>
            ${describeSummaryChip(groupedSources)}
            <span class="source-summary-actions">
              ${describeAvailabilityTestButton("测试订阅", groupedSources)}
              ${describeSubscriptionRefreshButton(groupedSources, subscriptionUrl)}
              ${describeBulkToggleButton("subscription", groupedSources)}
            </span>
          </div>
          <div class="source-tier-body">
            ${describeSourceListSection("订阅书源列表", groupedSources)}
          </div>
        </section>
      `)
      .join("");

    sections.push(`
      <details class="source-tier" data-tier="subscription">
        <summary class="source-tier-summary">
          <span class="source-tier-title">订阅书源</span>
          ${describeSummaryChip(allSubscriptionSources)}
          <span class="source-summary-actions">
            ${describeAvailabilityTestButton("测试此层", allSubscriptionSources)}
          </span>
        </summary>
        <div class="source-tier-body">
          ${subscriptionNodes}
        </div>
      </details>
    `);
  }

  return `
    <div class="source-toolbar">
      <button class="btn-secondary" id="filter-available-btn">只显示可用</button>
      <button class="btn-secondary" id="test-availability-btn">测试可用性</button>
      <button class="btn-secondary" id="disable-unavailable-btn">禁用不可用</button>
      <button class="btn-secondary" id="enable-all-sources-btn">启用全部</button>
      <button class="btn-secondary" id="delete-disabled-sources-btn">删除已禁用</button>
      <button class="btn-danger" id="dev-delete-all-sources-btn">${getDeleteAllButtonLabel(false)}</button>
    </div>
    ${describeTagFilterBar(allTags)}
    <div id="source-action-result" class="import-result"></div>
    <div class="source-tree" id="source-tree" data-filter="all" data-selected-tags="[]">${sections.join("")}</div>
  `;
}

export async function renderSettingsPage(): Promise<string> {
  let bookSources: LegacyBookSource[] = [];
  let replaceRules: LegacyReplaceRule[] = [];

  try {
    [bookSources, replaceRules] = await Promise.all([
      listBookSources(),
      listReplaceRules(),
    ]);
  } catch {
    bookSources = [];
    replaceRules = [];
  }

  const ruleRows = replaceRules
    .map(
      (r) => `
      <tr class="rule-row" data-id="${r.id}">
        <td>${escapeText(r.name)}</td>
        <td><code>${escapeText(r.pattern)}</code></td>
        <td>${escapeText(r.replacement)}</td>
        <td>
          <button class="btn-toggle ${r.isEnabled ? "active" : ""}" data-toggle="rule" data-id="${String(r.id)}">
            ${r.isEnabled ? "启用" : "禁用"}
          </button>
        </td>
      </tr>
    `,
    )
    .join("");

  return `
    <div class="page page-settings">
      <header class="page-header">
        <h1>设置</h1>
        <button class="btn-icon" data-nav="/" title="返回">&#x2190;</button>
      </header>

      <section class="settings-section">
        <div class="section-header">
          <h2>书源管理</h2>
          <div class="section-actions">
            <button class="btn-primary" id="import-json-btn">导入书源</button>
            <input type="file" id="import-json-input" accept="application/json,.json" hidden />
            <button class="btn-primary" id="import-url-btn">导入链接</button>
            <button class="btn-secondary" id="import-subscription-btn">订阅链接</button>
            <button class="btn-secondary" id="import-source-btn">开发专用：导入测试书源</button>
          </div>
        </div>
        ${describeBookSourceTree(bookSources)}
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h2>替换规则</h2>
        </div>
        <div class="table-wrapper">
          ${replaceRules.length > 0
            ? `<table class="data-table"><thead><tr><th>名称</th><th>匹配</th><th>替换</th><th>状态</th></tr></thead><tbody>${ruleRows}</tbody></table>`
            : '<p class="empty-state">暂无替换规则</p>'}
        </div>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h2>备份管理</h2>
        </div>
        <div class="backup-actions">
          <button class="btn-primary" id="import-backup-btn">导入备份</button>
          <button class="btn-secondary" id="export-backup-btn">导出备份</button>
        </div>
        <div id="import-result" class="import-result"></div>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h2>外观</h2>
        </div>
        <div class="appearance-settings" id="appearance-settings">
          <div class="setting-row">
            <span class="setting-label">主题</span>
            <div class="theme-buttons" id="theme-buttons"></div>
          </div>
          <div class="setting-row">
            <span class="setting-label">深色模式</span>
            <button class="btn-toggle" id="color-mode-btn"></button>
          </div>
          <div class="setting-row">
            <span class="setting-label">自定义 CSS</span>
            <button class="btn-secondary" id="edit-custom-css-btn">编辑</button>
          </div>
          <div id="custom-css-editor" class="custom-css-editor hidden">
            <textarea id="custom-css-input" class="custom-css-input" placeholder="输入自定义 CSS..."></textarea>
            <div class="custom-css-actions">
              <button class="btn-primary" id="save-custom-css-btn">保存</button>
              <button class="btn-secondary" id="cancel-custom-css-btn">取消</button>
            </div>
          </div>
          <div id="appearance-result" class="import-result"></div>
        </div>
      </section>

      <section class="settings-section" id="dev-mode-section" style="display:none">
        <div class="section-header">
          <h2>开发模式</h2>
        </div>
        <div class="dev-mode-panel">
          <div class="setting-row">
            <span class="setting-label">启用开发模式</span>
            <button class="btn-toggle" id="dev-mode-toggle-btn"></button>
          </div>
          <div class="setting-row">
            <button class="btn-secondary" id="view-logs-btn">查看日志</button>
            <button class="btn-secondary" id="open-log-file-btn">打开日志文件</button>
          </div>
          <div id="log-viewer" class="log-viewer hidden"></div>
          <div id="dev-mode-result" class="import-result"></div>
        </div>
      </section>
    </div>
  `;
}

export function initSettingsHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const sourceTree = $<HTMLElement>(container, "#source-tree");
  const importBackupBtn = $<HTMLButtonElement>(container, "#import-backup-btn");
  const importResult = $<HTMLElement>(container, "#import-result");
  const exportBackupBtn = $<HTMLButtonElement>(container, "#export-backup-btn");
  const importSourceBtn = $<HTMLButtonElement>(container, "#import-source-btn");
  const importJsonBtn = $<HTMLButtonElement>(container, "#import-json-btn");
  const importJsonInput = $<HTMLInputElement>(container, "#import-json-input");
  const importUrlBtn = $<HTMLButtonElement>(container, "#import-url-btn");
  const importSubscriptionBtn = $<HTMLButtonElement>(container, "#import-subscription-btn");
  const sourceActionResult = $<HTMLElement>(container, "#source-action-result");
  const testAvailabilityBtn = $<HTMLButtonElement>(container, "#test-availability-btn");
  const disableUnavailableBtn = $<HTMLButtonElement>(container, "#disable-unavailable-btn");
  const enableAllSourcesBtn = $<HTMLButtonElement>(container, "#enable-all-sources-btn");
  const deleteDisabledSourcesBtn = $<HTMLButtonElement>(container, "#delete-disabled-sources-btn");
  const filterAvailableBtn = $<HTMLButtonElement>(container, "#filter-available-btn");
  const devDeleteAllSourcesBtn = $<HTMLButtonElement>(container, "#dev-delete-all-sources-btn");
  const tagFilterBar = $<HTMLElement>(container, "#source-tag-filters");
  const filterStatus = $<HTMLElement>(container, "#source-filter-status");
  const availabilityResults = new Map<string, PersistedBookSourceAvailability>();
  const virtualListRenderers = new Map<string, () => void>();

  function renderSourceActionResult(kind: "loading" | "success" | "error", text: string) {
    sourceActionResult.innerHTML = `<div class="${kind === "loading" ? "loading" : `${kind}-msg`}">${escapeText(text)}</div>`;
  }

  function updateAvailabilityChip(status: PersistedBookSourceAvailability) {
    container.querySelectorAll<HTMLElement>("[data-availability-status]").forEach((chip) => {
      if (chip.dataset.sourceUrl !== status.sourceUrl) {
        return;
      }
      chip.textContent = status.available ? "可用" : "不可用";
      chip.classList.remove("pending", "available", "unavailable");
      chip.classList.add(status.available ? "available" : "unavailable");
      chip.title = status.detail
        ? `${describeLastTestedText(status.testedAt)} · ${status.detail}`
        : describeLastTestedText(status.testedAt);
    });

    container.querySelectorAll<HTMLElement>("[data-last-tested]").forEach((node) => {
      if (node.dataset.sourceUrl !== status.sourceUrl) {
        return;
      }
      node.textContent = describeLastTestedText(status.testedAt);
    });
  }

  function getCurrentAvailabilityResults(): PersistedBookSourceAvailabilityMap {
    return Object.fromEntries(availabilityResults.entries());
  }

  function persistAvailabilityStatuses(statuses: BookSourceAvailability[]) {
    let merged = getCurrentAvailabilityResults();
    for (const status of statuses) {
      merged = mergeAvailabilityResults(
        merged,
        [status],
        status.testedAt ?? String(Math.floor(Date.now() / 1000)),
      );
    }

    availabilityResults.clear();
    for (const [sourceUrl, status] of Object.entries(merged)) {
      availabilityResults.set(sourceUrl, status);
      applyAvailabilityToSourceSnapshot(status);
    }

    return merged;
  }

  async function testAvailabilityForScope(
    sourceUrls: string[],
    loadingLabel: string,
  ): Promise<BookSourceAvailability[]> {
    renderSourceActionResult("loading", `${loadingLabel} (0/${sourceUrls.length})`);

    return await runAvailabilityChecksIncrementally(
      sourceUrls,
      async (sourceUrl) => {
        const statuses = await testBookSourcesAvailability([sourceUrl]);
        return statuses[0] ?? {
          sourceUrl,
          available: false,
          detail: "未返回测试结果",
        };
      },
      (status) => {
        const persisted = persistAvailabilityStatuses([status]);
        const saved = persisted[status.sourceUrl];
        if (saved) {
          updateAvailabilityChip(saved);
        }
      },
      (text) => renderSourceActionResult("loading", text),
    );
  }

  for (const source of latestBookSourcesSnapshot) {
    const availabilityState = getSourceAvailabilityState(source);
    if (!availabilityState) {
      continue;
    }
    availabilityResults.set(source.bookSourceUrl, availabilityState);
  }

  function getSelectedTagFilters(): string[] {
    return parseSelectedTagFilters(sourceTree.dataset.selectedTags);
  }

  function renderTagFilterState(): void {
    const selectedFilters = getSelectedTagFilters();
    tagFilterBar.querySelectorAll<HTMLElement>("[data-tag-filter]").forEach((node) => {
      const value = node.dataset.tagFilter ?? "";
      node.classList.toggle("active", value === "" ? selectedFilters.length === 0 : selectedFilters.includes(value));
    });
    const selectedSummary = describeSelectedFilterSummary(selectedFilters);
    filterStatus.textContent = selectedFilters.length === 0
      ? "已选 0 项"
      : `已选 ${selectedFilters.length} 项 · ${selectedSummary}`;
  }

  function renderVirtualSourceList(listEl: HTMLElement, sources: LegacyBookSource[]): void {
    const filterMode = sourceTree.dataset.filter ?? "all";
    const selectedTags = getSelectedTagFilters();
    const filteredSources = getFilteredSources(sources, filterMode, selectedTags, availabilityResults);
    const totalCount = filteredSources.length;

    if (totalCount === 0) {
      listEl.innerHTML = "";
      listEl.style.height = "0px";
      listEl.classList.remove("is-scrollable");
      return;
    }

    const viewportHeight = getViewportHeight(totalCount || 1);
    const maxScrollTop = Math.max(0, totalCount * SOURCE_ROW_HEIGHT - viewportHeight);
    const scrollTop = Math.min(listEl.scrollTop, maxScrollTop);
    const windowState = computeVirtualWindow(totalCount, scrollTop, viewportHeight);
    const visibleSources = filteredSources.slice(windowState.startIndex, windowState.endIndex);

    listEl.style.height = `${viewportHeight}px`;
    listEl.classList.toggle("is-scrollable", totalCount > SOURCE_LIST_MAX_VISIBLE_ROWS);
    listEl.innerHTML = `
      <div class="source-virtual-canvas" style="height:${String(totalCount * SOURCE_ROW_HEIGHT)}px;">
        <div class="source-virtual-items" style="transform: translateY(${String(windowState.offsetTop)}px);">
          ${describeSourceItems(visibleSources)}
        </div>
      </div>
    `;
  }

  function updateSourceSummaries(): void {
    const filterMode = sourceTree.dataset.filter ?? "all";
    const selectedTags = getSelectedTagFilters();

    sourceTree.querySelectorAll<HTMLElement>("[data-source-summary]").forEach((summaryEl) => {
      const sourceUrls = JSON.parse(summaryEl.dataset.sourceSummary ?? "[]") as string[];
      const sources = latestBookSourcesSnapshot.filter((source) => sourceUrls.includes(source.bookSourceUrl));
      summaryEl.textContent = describeFilteredEnabledSummary(
        sources,
        selectedTags,
        filterMode,
        availabilityResults,
      );
      const filterHintEl = summaryEl.parentElement?.querySelector<HTMLElement>("[data-source-summary-filter]");
      const selectedSummary = describeSelectedFilterSummary(selectedTags);
      if (filterHintEl) {
        filterHintEl.hidden = selectedSummary.length === 0;
        filterHintEl.textContent = selectedSummary ? `筛选: ${selectedSummary}` : "";
      }
    });
  }

  function syncSourceTreeVisibility(): void {
    const filterMode = sourceTree.dataset.filter ?? "all";
    const selectedTags = getSelectedTagFilters();

    sourceTree.querySelectorAll<HTMLElement>("[data-source-virtual-list]").forEach((listEl) => {
      const listId = listEl.dataset.sourceVirtualList ?? "";
      const sources = sourceListRegistry.get(listId) ?? [];
      const visibleCount = getFilteredSources(sources, filterMode, selectedTags, availabilityResults).length;
      const subscriptionCard = listEl.closest<HTMLElement>(".source-subscription");
      const listCard = listEl.closest<HTMLElement>(".source-list-card");
      const localTier = listEl.closest<HTMLElement>(".source-tier[data-tier='local']");

      if (subscriptionCard) {
        subscriptionCard.hidden = visibleCount === 0;
      } else if (listCard && localTier) {
        localTier.hidden = visibleCount === 0;
      }
    });

    sourceTree.querySelectorAll<HTMLElement>(".source-tier[data-tier='subscription']").forEach((tier) => {
      const visibleSubscriptions = tier.querySelectorAll<HTMLElement>(".source-subscription:not([hidden])");
      tier.hidden = visibleSubscriptions.length === 0;
    });
  }

  function rerenderVirtualSourceLists(): void {
    renderTagFilterState();
    for (const render of virtualListRenderers.values()) {
      render();
    }
    updateSourceSummaries();
    syncSourceTreeVisibility();
  }

  sourceTree.querySelectorAll<HTMLElement>("[data-source-virtual-list]").forEach((listEl) => {
    const listId = listEl.dataset.sourceVirtualList ?? "";
    const sources = sourceListRegistry.get(listId) ?? [];
    let scheduled = false;
    const scheduleFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16);

    const render = () => {
      renderVirtualSourceList(listEl, sources);
    };

    listEl.addEventListener("scroll", () => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      scheduleFrame(() => {
        scheduled = false;
        render();
      });
    });

    virtualListRenderers.set(listId, render);
    render();
  });

  updateSourceSummaries();
  renderTagFilterState();
  syncSourceTreeVisibility();

  container.querySelectorAll<HTMLButtonElement>("[data-bulk-toggle]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const sourceUrls = JSON.parse(btn.dataset.sourceUrls ?? "[]") as string[];
      if (sourceUrls.length === 0) {
        return;
      }

      const currentlyEnabled = btn.dataset.enabled === "true";
      const changed = await setBookSourcesEnabled(sourceUrls, !currentlyEnabled);
      if (changed > 0) {
        window.location.reload();
      }
    });
  });

  tagFilterBar.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>("[data-tag-filter]");
    if (!btn) {
      return;
    }

    const value = btn.dataset.tagFilter ?? "";
    if (value === "") {
      sourceTree.dataset.selectedTags = "[]";
      rerenderVirtualSourceLists();
      return;
    }

    const selectedFilters = new Set(getSelectedTagFilters());
    if (selectedFilters.has(value)) {
      selectedFilters.delete(value);
    } else {
      selectedFilters.add(value);
    }

    sourceTree.dataset.selectedTags = JSON.stringify(Array.from(selectedFilters));
    rerenderVirtualSourceLists();
  });

  sourceTree.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;

    const availabilityBtn = target.closest<HTMLButtonElement>("[data-availability-test]");
    if (availabilityBtn) {
      event.preventDefault();
      event.stopPropagation();

      const sourceUrls = JSON.parse(availabilityBtn.dataset.sourceUrls ?? "[]") as string[];
      const label = availabilityBtn.dataset.label ?? "测试范围";
      if (sourceUrls.length === 0) {
        return;
      }

      try {
        const statuses = await testAvailabilityForScope(sourceUrls, `${label}中`);
        rerenderVirtualSourceLists();
        const unavailableCount = statuses.filter((status) => !status.available).length;
        renderSourceActionResult(
          unavailableCount === 0 ? "success" : "error",
          `${label}完成：可用 ${statuses.length - unavailableCount} 个，不可用 ${unavailableCount} 个`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        renderSourceActionResult("error", `${label}失败：${msg}`);
      }
      return;
    }

    const toggleBtn = target.closest<HTMLButtonElement>("[data-toggle='source']");
    if (toggleBtn) {
      const url = toggleBtn.dataset.url!;
      const currentState = toggleBtn.classList.contains("active");
      const success = await toggleBookSource(url, !currentState);
      if (success) {
        window.location.reload();
      }
      return;
    }

    const deleteBtn = target.closest<HTMLButtonElement>("[data-delete='source']");
    if (deleteBtn) {
      const url = deleteBtn.dataset.url!;
      const success = await deleteBookSource(url);
      if (success) {
        window.location.reload();
      }
    }
  });

  async function runAvailabilityCheck(): Promise<BookSourceAvailability[]> {
    const allSources = await listBookSources();
    const statuses = await testAvailabilityForScope(
      allSources.map((source) => source.bookSourceUrl),
      "测试书源可用性中",
    );
    rerenderVirtualSourceLists();
    const unavailableCount = statuses.filter((status) => !status.available).length;
    renderSourceActionResult(
      unavailableCount === 0 ? "success" : "error",
      `测试完成：可用 ${statuses.length - unavailableCount} 个，不可用 ${unavailableCount} 个`,
    );
    return statuses;
  }

  testAvailabilityBtn.addEventListener("click", async () => {
    try {
      await runAvailabilityCheck();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderSourceActionResult("error", `测试失败：${msg}`);
    }
  });

  disableUnavailableBtn.addEventListener("click", async () => {
    try {
      const statuses = availabilityResults.size > 0
        ? Array.from(availabilityResults.values())
        : await runAvailabilityCheck();
      const unavailableUrls = statuses
        .filter((status) => !status.available)
        .map((status) => status.sourceUrl);
      if (unavailableUrls.length === 0) {
        renderSourceActionResult("success", "没有不可用书源需要禁用");
        return;
      }
      renderSourceActionResult("loading", "禁用不可用书源中...");
      const changed = await setBookSourcesEnabled(unavailableUrls, false);
      renderSourceActionResult("success", `已禁用 ${changed} 个不可用书源`);
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderSourceActionResult("error", `批量禁用失败：${msg}`);
    }
  });

  enableAllSourcesBtn.addEventListener("click", async () => {
    try {
      renderSourceActionResult("loading", "启用全部书源中...");
      const changed = await enableAllBookSources();
      renderSourceActionResult("success", `已启用 ${changed} 个书源`);
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderSourceActionResult("error", `启用全部失败：${msg}`);
    }
  });

  deleteDisabledSourcesBtn.addEventListener("click", async () => {
    try {
      renderSourceActionResult("loading", "删除已禁用书源中...");
      const deleted = await deleteDisabledBookSources();
      renderSourceActionResult("success", `已删除 ${deleted} 个已禁用书源`);
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderSourceActionResult("error", `批量删除失败：${msg}`);
    }
  });

  devDeleteAllSourcesBtn.addEventListener("click", async () => {
    try {
      renderSourceActionResult("loading", "删除全部书源中...");
      const sources = await listBookSources();
      if (sources.length === 0) {
        renderSourceActionResult("success", "当前没有书源可删除");
        return;
      }
      const deleted = await deleteBookSources(sources.map((source) => source.bookSourceUrl));
      renderSourceActionResult("success", `已删除 ${deleted} 个书源`);
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderSourceActionResult("error", `删除全部失败：${msg}`);
    }
  });

  filterAvailableBtn.addEventListener("click", () => {
    const isFiltered = sourceTree.dataset.filter === "available";

    if (isFiltered) {
      sourceTree.dataset.filter = "all";
      filterAvailableBtn.textContent = "只显示可用";
      filterAvailableBtn.classList.remove("active");
    } else {
      sourceTree.dataset.filter = "available";
      filterAvailableBtn.textContent = "显示全部";
      filterAvailableBtn.classList.add("active");
    }

    rerenderVirtualSourceLists();
  });

  importSourceBtn.addEventListener("click", async () => {
    importResult.innerHTML = '<div class="loading">加载测试书源中...</div>';
    try {
      const sources = await loadBookSourcesFromFile();
      importResult.innerHTML = `
        <div class="success-msg">成功加载 ${sources.length} 个测试书源！</div>
      `;
      window.location.reload();
    } catch {
      importResult.innerHTML = '<div class="error-msg">加载测试书源失败</div>';
    }
  });

  importJsonBtn.addEventListener("click", () => importJsonInput.click());

  function openUrlImportForm(mode: "direct" | "subscription") {
    const inputLabel = mode === "subscription" ? "订阅链接" : "书源链接";
    const loadingText = mode === "subscription" ? "从订阅链接导入书源中..." : "从链接导入书源中...";
    const successText = mode === "subscription" ? "成功导入订阅书源" : "成功导入书源";
    const importHandler =
      mode === "subscription" ? importBookSourcesSubscription : importBookSourcesUrl;

    importResult.innerHTML = `
      <div class="url-import-form" style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <input id="url-import-input" type="url" class="search-input"
               placeholder="https://... ${inputLabel}"
               style="flex:1;" />
        <button id="url-import-go" class="btn-primary">导入</button>
        <button id="url-import-cancel" class="btn-secondary">取消</button>
      </div>
    `;
    const input = importResult.querySelector<HTMLInputElement>("#url-import-input")!;
    const goBtn = importResult.querySelector<HTMLButtonElement>("#url-import-go")!;
    const cancelBtn = importResult.querySelector<HTMLButtonElement>("#url-import-cancel")!;
    input.focus();

    async function submit() {
      const trimmed = input.value.trim();
      if (!trimmed) return;
      if (!/^https?:\/\//i.test(trimmed)) {
        importResult.innerHTML = '<div class="error-msg">链接必须以 http:// 或 https:// 开头</div>';
        return;
      }
      importResult.innerHTML = `<div class="loading">${loadingText}</div>`;
      try {
        const sources = await importHandler(trimmed);
        importResult.innerHTML = `
          <div class="success-msg">${successText} ${sources.length} 个！</div>
        `;
        window.location.reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        importResult.innerHTML = `<div class="error-msg">导入失败：${msg}</div>`;
      }
    }

    goBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", () => {
      importResult.innerHTML = "";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") importResult.innerHTML = "";
    });
  }

  importUrlBtn.addEventListener("click", () => openUrlImportForm("direct"));
  importSubscriptionBtn.addEventListener("click", () => openUrlImportForm("subscription"));

  importJsonInput.addEventListener("change", async () => {
    const file = importJsonInput.files?.[0];
    importJsonInput.value = "";
    if (!file) return;
    importResult.innerHTML = '<div class="loading">导入书源中...</div>';
    try {
      const text = await file.text();
      const sources = await importBookSourcesJson(text);
      importResult.innerHTML = `
        <div class="success-msg">成功导入 ${sources.length} 个书源！</div>
      `;
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      importResult.innerHTML = `<div class="error-msg">导入失败：${msg}</div>`;
    }
  });

  importBackupBtn.addEventListener("click", async () => {
    const path = prompt("请输入备份路径：");
    if (!path) return;
    importResult.innerHTML = '<div class="loading">导入中...</div>';
    try {
      const summary = await importBackup(path);
      importResult.innerHTML = `
        <div class="success-msg">
          导入成功！书源: ${summary.book_sources_count}, RSS: ${summary.rss_sources_count}, 规则: ${summary.replace_rules_count}
        </div>
      `;
    } catch {
      importResult.innerHTML = '<div class="error-msg">导入失败</div>';
    }
  });

  container.querySelectorAll<HTMLButtonElement>("[data-subscription-refresh]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const subscriptionUrl = btn.dataset.subscriptionUrl!;
      const sourceUrls = JSON.parse(btn.dataset.sourceUrls ?? "[]") as string[];
      if (sourceUrls.length === 0) return;

      renderSourceActionResult("loading", "更新订阅中...");
      try {
        const sources = await importBookSourcesSubscription(subscriptionUrl);
        renderSourceActionResult(
          "success",
          `订阅已更新，新增 ${sources.length} 个书源`,
        );
        window.location.reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        renderSourceActionResult("error", `更新订阅失败：${msg}`);
      }
    });
  });

  exportBackupBtn.addEventListener("click", () => {
    alert("导出功能开发中...");
  });

  // ---- Appearance Settings ----
  const themeButtons = $<HTMLElement>(container, "#theme-buttons");
  const colorModeBtn = $<HTMLButtonElement>(container, "#color-mode-btn");
  const editCustomCssBtn = $<HTMLButtonElement>(container, "#edit-custom-css-btn");
  const customCssEditor = $<HTMLElement>(container, "#custom-css-editor");
  const customCssInput = $<HTMLTextAreaElement>(container, "#custom-css-input");
  const saveCustomCssBtn = $<HTMLButtonElement>(container, "#save-custom-css-btn");
  const cancelCustomCssBtn = $<HTMLButtonElement>(container, "#cancel-custom-css-btn");
  const appearanceResult = $<HTMLElement>(container, "#appearance-result");

  function renderAppearanceResult(kind: "success" | "error" | "loading", text: string) {
    appearanceResult.innerHTML = `<div class="${kind === "loading" ? "loading" : `${kind}-msg`}">${escapeText(text)}</div>`;
  }

  function renderThemeButtons() {
    const current = getCurrentTheme();
    const options = describeThemeOptions();
    themeButtons.innerHTML = options
      .map(
        ({ name, label }) => `
        <button class="theme-switcher-btn ${current === name ? "active" : ""}" data-theme="${escapeAttr(name)}">
          ${escapeText(label)}
        </button>
      `,
      )
      .join("");
  }

  function renderColorModeBtn() {
    const isDark = getColorMode() === "dark";
    colorModeBtn.textContent = isDark ? "深色" : "浅色";
    colorModeBtn.classList.toggle("active", isDark);
  }

  renderThemeButtons();
  renderColorModeBtn();

  themeButtons.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".theme-switcher-btn");
    if (!btn) return;
    const name = btn.dataset.theme as ThemeName;
    setCurrentTheme(name);
    renderThemeButtons();
    renderAppearanceResult("success", `已切换到 ${btn.textContent ?? name} 主题`);
  });

  colorModeBtn.addEventListener("click", () => {
    const mode = toggleColorMode();
    renderColorModeBtn();
    renderAppearanceResult("success", `已切换到${mode === "dark" ? "深色" : "浅色"}模式`);
  });

  editCustomCssBtn.addEventListener("click", () => {
    customCssInput.value = getCustomCss();
    customCssEditor.classList.remove("hidden");
    editCustomCssBtn.textContent = "收起";
    editCustomCssBtn.dataset.expanded = "true";
  });

  cancelCustomCssBtn.addEventListener("click", () => {
    customCssEditor.classList.add("hidden");
    editCustomCssBtn.textContent = "编辑";
    delete editCustomCssBtn.dataset.expanded;
  });

  saveCustomCssBtn.addEventListener("click", () => {
    const css = customCssInput.value;
    setCustomCss(css);
    customCssEditor.classList.add("hidden");
    editCustomCssBtn.textContent = "编辑";
    delete editCustomCssBtn.dataset.expanded;
    renderAppearanceResult("success", "自定义 CSS 已保存");
  });

  // ---- Dev Mode ----
  const devModeSection = $<HTMLElement>(container, "#dev-mode-section");
  const devModeToggleBtn = $<HTMLButtonElement>(container, "#dev-mode-toggle-btn");
  const viewLogsBtn = $<HTMLButtonElement>(container, "#view-logs-btn");
  const openLogFileBtn = $<HTMLButtonElement>(container, "#open-log-file-btn");
  const logViewer = $<HTMLElement>(container, "#log-viewer");
  const devModeResult = $<HTMLElement>(container, "#dev-mode-result");

  function renderDevModeResult(kind: "success" | "error" | "loading", text: string) {
    devModeResult.innerHTML = `<div class="${kind === "loading" ? "loading" : `${kind}-msg`}">${escapeText(text)}</div>`;
  }

  getDevModeStatus()
    .then((status) => {
      if (!status.available) return;
      devModeSection.style.display = "block";
      devModeToggleBtn.classList.toggle("active", status.enabled);
      devModeToggleBtn.textContent = status.enabled ? "已启用" : "已禁用";
    })
    .catch(() => {
      // Dev mode not available, stay hidden.
    });

  devModeToggleBtn.addEventListener("click", async () => {
    const currentState = devModeToggleBtn.classList.contains("active");
    renderDevModeResult("loading", "切换中...");
    try {
      const newState = await toggleDevMode(!currentState);
      devModeToggleBtn.classList.toggle("active", newState);
      devModeToggleBtn.textContent = newState ? "已启用" : "已禁用";
      renderDevModeResult("success", `开发模式${newState ? "已启用" : "已禁用"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderDevModeResult("error", `切换失败：${msg}`);
    }
  });

  viewLogsBtn.addEventListener("click", async () => {
    if (logViewer.classList.contains("hidden")) {
      logViewer.classList.remove("hidden");
      viewLogsBtn.textContent = "收起日志";
      renderDevModeResult("loading", "加载日志中...");
      try {
        const lines = await getLogLines(200);
        if (lines.length === 0) {
          logViewer.innerHTML = '<p class="empty-state">暂无日志</p>';
        } else {
          logViewer.innerHTML = lines
            .map(
              (line) =>
                `<div class="log-line log-${escapeAttr(line.level.toLowerCase())}"><span class="log-ts">${escapeText(line.timestamp)}</span> <span class="log-level">[${escapeText(line.level)}]</span> <span class="log-module">${escapeText(line.target)}</span> <span class="log-msg">${escapeText(line.message)}</span></div>`,
            )
            .join("");
        }
        renderDevModeResult("success", `显示最近 ${lines.length} 条日志`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logViewer.innerHTML = `<div class="error-msg">加载日志失败：${escapeText(msg)}</div>`;
        renderDevModeResult("error", `加载日志失败：${msg}`);
      }
    } else {
      logViewer.classList.add("hidden");
      viewLogsBtn.textContent = "查看日志";
    }
  });

  openLogFileBtn.addEventListener("click", async () => {
    renderDevModeResult("loading", "打开日志文件中...");
    try {
      await openLogFile();
      renderDevModeResult("success", "日志文件已用系统默认应用打开");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      renderDevModeResult("error", `打开失败：${msg}`);
    }
  });
}
