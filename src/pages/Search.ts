import { searchBooks, listBookSources } from "../api.ts";
import { navigate } from "../router.ts";
import { $ } from "../query.ts";
import type { SearchResult, LegacyBookSource } from "../types.ts";
import {
  LEGACY_BOOK_SOURCE_COMPAT_DISABLED_MESSAGE,
  LEGACY_BOOK_SOURCE_COMPAT_ENABLED,
} from "../compatibility.ts";

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

export async function renderSearchPage(): Promise<string> {
  if (!LEGACY_BOOK_SOURCE_COMPAT_ENABLED) {
    return `
      <div class="page page-search">
        <header class="page-header">
          <h1>搜索</h1>
          <button class="btn-icon" data-nav="/" title="返回书架">&#x2190;</button>
        </header>
        <div class="empty-state"><p>${LEGACY_BOOK_SOURCE_COMPAT_DISABLED_MESSAGE}</p></div>
      </div>
    `;
  }

  let sources: LegacyBookSource[] = [];
  try {
    sources = await listBookSources();
  } catch {
    sources = [];
  }

  const sourceFilters = describeSearchSourceFilters(sources);

  return `
    <div class="page page-search">
      <header class="page-header">
        <h1>搜索</h1>
        <button class="btn-icon" data-nav="/" title="返回书架">&#x2190;</button>
      </header>
      <div class="search-form">
        ${sourceFilters}
        <div class="search-input-row">
          <input
            id="search-keyword"
            type="text"
            class="search-input"
            placeholder="输入书名或作者..."
            autocomplete="off"
          />
          <button id="search-btn" class="btn-primary">搜索</button>
        </div>
      </div>
      <div id="search-results" class="search-results"></div>
    </div>
  `;
}

export function initSearchHandlers(container: HTMLElement) {
  if (!LEGACY_BOOK_SOURCE_COMPAT_ENABLED) {
    container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.nav!));
    });
    return;
  }

  const keywordInput = $<HTMLInputElement>(container, "#search-keyword");
  const sourcePicker = $<HTMLElement>(container, "#search-source-picker");
  const sourceStatus = $<HTMLElement>(container, "#search-source-status");
  const searchBtn = $<HTMLButtonElement>(container, "#search-btn");
  const resultsEl = $<HTMLElement>(container, "#search-results");
  let selectedTag = "";
  let selectedSource = "";

  function sourceMatchesSelectedTag(node: HTMLElement): boolean {
    if (!selectedTag.startsWith("tag:")) {
      return true;
    }

    const tagName = selectedTag.slice("tag:".length);
    try {
      const tags = JSON.parse(node.dataset.searchSourceTags ?? "[]") as string[];
      return tags.includes(tagName);
    } catch {
      return false;
    }
  }

  function updateSourceChipVisibility(): void {
    sourcePicker.querySelectorAll<HTMLElement>("[data-search-source-value]").forEach((node) => {
      const value = node.dataset.searchSourceValue ?? "";
      if (!value) {
        node.hidden = false;
        return;
      }
      node.hidden = !sourceMatchesSelectedTag(node);
    });

    const sourceRow = sourcePicker.querySelector<HTMLElement>(".search-filter-row--sources");
    if (sourceRow) {
      const visibleSourceChips = sourceRow.querySelectorAll<HTMLElement>("[data-search-source-value]:not([hidden])");
      sourceRow.hidden = visibleSourceChips.length <= 1;
    }
  }

  function renderSourceSelection(): void {
    updateSourceChipVisibility();
    const selectedSourceChip = selectedSource
      ? sourcePicker.querySelector<HTMLElement>(`[data-search-source-value="${CSS.escape(selectedSource)}"]`)
      : null;
    if (selectedSourceChip?.hidden) {
      selectedSource = "";
    }

    sourcePicker.querySelectorAll<HTMLElement>("[data-search-tag-value]").forEach((node) => {
      node.classList.toggle("active", (node.dataset.searchTagValue ?? "") === selectedTag);
    });
    sourcePicker.querySelectorAll<HTMLElement>("[data-search-source-value]").forEach((node) => {
      node.classList.toggle("active", (node.dataset.searchSourceValue ?? "") === selectedSource);
    });
    sourceStatus.textContent = describeSearchScopeLabel(selectedTag, selectedSource);
  }

  async function doSearch() {
    const keyword = keywordInput.value.trim();

    if (!keyword) return;

    resultsEl.innerHTML = '<div class="loading">搜索中...</div>';
    searchBtn.disabled = true;

    try {
      const allSources = await listBookSources();
      const selectedSources = resolveSearchSources(selectedTag, selectedSource, allSources);
      if (selectedSources.length === 0) {
        resultsEl.innerHTML =
          '<div class="empty-state"><p>暂无匹配的启用书源，请先去设置检查标签或书源状态。</p></div>';
        return;
      }

      const settled = await Promise.allSettled(
        selectedSources.map((source) => searchBooks(source.bookSourceUrl, keyword, 1)),
      );
      const results: SearchResult[] = [];
      const failures: string[] = [];
      settled.forEach((result, index) => {
        const source = selectedSources[index];
        if (result.status === "fulfilled") {
          results.push(...result.value);
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          failures.push(`${source.bookSourceName}: ${msg}`);
        }
      });
      renderResults(results, failures);
    } finally {
      searchBtn.disabled = false;
    }
  }

  function renderResults(results: SearchResult[], failures: string[] = []) {
    const failureHtml = failures.length
      ? `<details class="search-failures"><summary>${failures.length} 个书源报错</summary><ul>${failures
          .map((f) => `<li>${f.replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" })[c]!)}</li>`)
          .join("")}</ul></details>`
      : "";
    if (results.length === 0) {
      resultsEl.innerHTML = `${failureHtml}<div class="empty-state"><p>未找到相关书籍</p></div>`;
      return;
    }

    const cards = results
      .map(
        (r) => `
        <li class="result-card" data-book-url="${r.book_url}" tabindex="0" role="button">
          <input type="hidden" class="result-source-id" value="${escapeHtml(r.source_id)}" />
          <div class="result-cover">
            ${r.cover_url ? `<img src="${escapeHtml(r.cover_url)}" alt="${escapeHtml(r.name)}" loading="lazy" />` : `<div class="result-cover-placeholder"><span>${escapeHtml(r.name).charAt(0)}</span></div>`}
          </div>
          <div class="result-info">
            <h3 class="result-title">${escapeHtml(r.name)}</h3>
            <p class="result-author">${escapeHtml(r.author)}</p>
            ${r.intro ? `<p class="result-intro">${escapeHtml(r.intro)}</p>` : ""}
            ${r.last_chapter ? `<p class="result-chapter">最新: ${escapeHtml(r.last_chapter)}</p>` : ""}
          </div>
        </li>
      `,
      )
      .join("");

    resultsEl.innerHTML = `${failureHtml}<ul class="result-list">${cards}</ul>`;

    resultsEl.querySelectorAll<HTMLElement>("[data-book-url]").forEach((el) => {
      el.addEventListener("click", async () => {
        const bookUrl = el.dataset.bookUrl!;
        const sourceId = (el.querySelector<HTMLInputElement>(".result-source-id")?.value ?? "").trim();
        navigate(`/online-reader/${encodeURIComponent(bookUrl)}/${encodeURIComponent(sourceId)}`);
      });
      el.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          el.click();
        }
      });
    });
  }

  sourcePicker.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const tagBtn = target.closest<HTMLElement>("[data-search-tag-value]");
    if (tagBtn) {
      selectedTag = tagBtn.dataset.searchTagValue ?? "";
      renderSourceSelection();
      return;
    }

    const sourceBtn = target.closest<HTMLElement>("[data-search-source-value]");
    if (!sourceBtn) {
      return;
    }
    selectedSource = sourceBtn.dataset.searchSourceValue ?? "";
    renderSourceSelection();
  });

  renderSourceSelection();

  searchBtn.addEventListener("click", doSearch);
  keywordInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") doSearch();
  });

  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });
}
