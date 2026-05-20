import type {
  BookSourceAvailability,
  LegacyBookSource,
} from "../types.ts";

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

function describeSourceListSection(
  title: string,
  sources: LegacyBookSource[],
  extraActions: string = "",
): string {
  const listId = registerSourceList(sources);

  return `
    <details class="source-list-card" open>
      <summary class="source-list-card-header">
        <span class="source-list-card-title">${escapeText(title)}</span>
        ${describeSummaryChip(sources)}
        <span class="source-summary-actions">
          ${describeAvailabilityTestButton("测试此层", sources)}
          ${extraActions}
        </span>
      </summary>
      ${describeVirtualSourceList(listId, sources)}
    </details>
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
        <details class="source-subscription" data-subscription-url="${escapeAttr(subscriptionUrl)}">
          <summary class="source-subscription-summary">
            <span class="source-subscription-title">订阅链接</span>
            <code class="source-subscription-url">${escapeText(subscriptionUrl)}</code>
            ${describeSummaryChip(groupedSources)}
            <span class="source-summary-actions">
              ${describeAvailabilityTestButton("测试订阅", groupedSources)}
              ${describeSubscriptionRefreshButton(groupedSources, subscriptionUrl)}
              ${describeBulkToggleButton("subscription", groupedSources)}
            </span>
          </summary>
          <div class="source-tier-body">
            ${describeSourceListSection("订阅书源列表", groupedSources)}
          </div>
        </details>
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
