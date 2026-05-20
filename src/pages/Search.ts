import type { LegacyBookSource } from "../types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SEARCH_TAG_UNTAGGED = "__untagged";

export function parseSearchSourceTags(rawValue?: string): string[] {
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

export function resolveSearchSourceSelection(
  value: string,
  sources: LegacyBookSource[],
): LegacyBookSource[] {
  const enabledSources = sources.filter((source) => source.enabled);

  if (!value) {
    return enabledSources;
  }

  if (value.startsWith("tag:")) {
    const tag = value.slice("tag:".length);
    if (tag === SEARCH_TAG_UNTAGGED) {
      return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).length === 0);
    }
    return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).includes(tag));
  }

  if (value.startsWith("source:")) {
    const sourceUrl = value.slice("source:".length);
    return enabledSources.filter((source) => source.bookSourceUrl === sourceUrl);
  }

  return enabledSources.filter((source) => source.bookSourceUrl === value);
}

export function resolveSearchSources(
  selectedTag: string,
  selectedSource: string,
  sources: LegacyBookSource[],
): LegacyBookSource[] {
  if (selectedSource) {
    return resolveSearchSourceSelection(selectedSource, sources);
  }

  if (selectedTag) {
    return resolveSearchSourceSelection(selectedTag, sources);
  }

  return resolveSearchSourceSelection("", sources);
}

function describeSearchScopeLabel(selectedTag: string, selectedSource: string): string {
  const tagLabel = selectedTag.startsWith("tag:")
    ? `标签：${selectedTag.slice("tag:".length)}`
    : "标签：全部";
  const sourceLabel = selectedSource.startsWith("source:")
    ? "书源：单个"
    : "书源：全部";
  return `${tagLabel} · ${sourceLabel}`;
}

export function describeSearchSourceFilters(sources: LegacyBookSource[]): string {
  const enabledSources = sources.filter((source) => source.enabled);
  const tagNames = Array.from(
    new Set(enabledSources.flatMap((source) => parseSearchSourceTags(source.bookSourceGroup))),
  ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));

  const tagChips = tagNames
    .map((tagName) =>
      `<button class="search-filter-chip" data-search-tag-value="tag:${escapeHtml(tagName)}">标签：${escapeHtml(tagName)}</button>`
    )
    .join("");
  const untaggedChip = enabledSources.some((source) => parseSearchSourceTags(source.bookSourceGroup).length === 0)
    ? `<button class="search-filter-chip active" data-search-tag-value="tag:${SEARCH_TAG_UNTAGGED}">标签：未标记</button>`
    : "";

  const sourceChips = enabledSources
    .map((source) => {
      const tagPayload = escapeHtml(JSON.stringify(parseSearchSourceTags(source.bookSourceGroup)));
      return `<button class="search-filter-chip search-filter-chip--source" data-search-source-value="source:${escapeHtml(source.bookSourceUrl)}" data-search-source-tags="${tagPayload}">${escapeHtml(source.bookSourceName)}</button>`;
    })
    .join("");

  return `
    <div class="search-source-picker" id="search-source-picker" data-selected-tag="" data-selected-source="">
      <div class="search-source-status" id="search-source-status">${describeSearchScopeLabel("", "")}</div>
      <div class="search-filter-row">
        <span class="search-filter-label">按标签筛选书源</span>
        <button class="search-filter-chip active" data-search-tag-value="">全部标签</button>
        ${untaggedChip}
        ${tagChips}
      </div>
      ${sourceChips ? `
        <div class="search-filter-row search-filter-row--sources">
          <span class="search-filter-label">选择具体书源</span>
          <button class="search-filter-chip search-filter-chip--source active" data-search-source-value="">全部书源</button>
          ${sourceChips}
        </div>
      ` : ""}
    </div>
  `;
}
