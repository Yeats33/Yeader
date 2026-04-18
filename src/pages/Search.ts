import { searchBooks, listBookSources, addBookToShelf } from "../api.ts";
import { navigate } from "../router.ts";
import { $ } from "../query.ts";
import type { SearchResult, LegacyBookSource } from "../types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSourceGroupName(source: LegacyBookSource): string {
  return source.bookSourceGroup?.trim() || "未分组";
}

function getSubscriptionUrl(source: LegacyBookSource): string | null {
  const value = source.subscriptionUrl?.trim();
  return value ? value : null;
}

export function resolveSearchSourceSelection(
  value: string,
  sources: LegacyBookSource[],
): LegacyBookSource[] {
  const enabledSources = sources.filter((source) => source.enabled);

  if (!value) {
    return enabledSources;
  }

  if (value.startsWith("group:")) {
    const groupName = value.slice("group:".length);
    return enabledSources.filter((source) => getSourceGroupName(source) === groupName);
  }

  if (value.startsWith("subscription:")) {
    const subscriptionUrl = value.slice("subscription:".length);
    return enabledSources.filter((source) => getSubscriptionUrl(source) === subscriptionUrl);
  }

  if (value.startsWith("source:")) {
    const sourceUrl = value.slice("source:".length);
    return enabledSources.filter((source) => source.bookSourceUrl === sourceUrl);
  }

  return enabledSources.filter((source) => source.bookSourceUrl === value);
}

export function describeSearchSourceOptions(sources: LegacyBookSource[]): string {
  const enabledSources = sources.filter((source) => source.enabled);
  const groupNames = Array.from(new Set(enabledSources.map((source) => getSourceGroupName(source))))
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  const subscriptionUrls = Array.from(
    new Set(
      enabledSources
        .map((source) => getSubscriptionUrl(source))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const parentOptions = [
    ...groupNames.map((groupName) =>
      `<option value="group:${escapeHtml(groupName)}">分组：${escapeHtml(groupName)}</option>`
    ),
    ...subscriptionUrls.map((subscriptionUrl) =>
      `<option value="subscription:${escapeHtml(subscriptionUrl)}">订阅：${escapeHtml(subscriptionUrl)}</option>`
    ),
  ].join("");

  const leafOptions = enabledSources
    .map((source) =>
      `<option value="source:${escapeHtml(source.bookSourceUrl)}">${escapeHtml(source.bookSourceName)}</option>`
    )
    .join("");

  return `
    <option value="">全部书源</option>
    ${parentOptions ? `<optgroup label="父级分类">${parentOptions}</optgroup>` : ""}
    ${leafOptions ? `<optgroup label="具体书源">${leafOptions}</optgroup>` : ""}
  `;
}

export async function renderSearchPage(): Promise<string> {
  let sources: LegacyBookSource[] = [];
  try {
    sources = await listBookSources();
  } catch {
    sources = [];
  }

  const sourceOptions = describeSearchSourceOptions(sources);

  return `
    <div class="page page-search">
      <header class="page-header">
        <h1>搜索</h1>
        <button class="btn-icon" data-nav="/" title="返回书架">&#x2190;</button>
      </header>
      <div class="search-form">
        <select id="search-source" class="search-select">
          ${sourceOptions}
        </select>
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
  const keywordInput = $<HTMLInputElement>(container, "#search-keyword");
  const sourceSelect = $<HTMLSelectElement>(container, "#search-source");
  const searchBtn = $<HTMLButtonElement>(container, "#search-btn");
  const resultsEl = $<HTMLElement>(container, "#search-results");

  async function doSearch() {
    const keyword = keywordInput.value.trim();
    const selectedValue = sourceSelect.value;

    if (!keyword) return;

    resultsEl.innerHTML = '<div class="loading">搜索中...</div>';
    searchBtn.disabled = true;

    try {
      const allSources = await listBookSources();
      const selectedSources = resolveSearchSourceSelection(selectedValue, allSources);
      if (selectedSources.length === 0) {
        resultsEl.innerHTML =
          '<div class="empty-state"><p>暂无匹配的启用书源，请先去设置检查分组或订阅状态。</p></div>';
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
        await addBookToShelf({
          url: bookUrl,
          name: el.querySelector(".result-title")?.textContent ?? "",
          author: el.querySelector(".result-author")?.textContent ?? "",
          source_url: sourceId,
          cover_url: el.querySelector("img")?.src,
        });
        navigate("/");
      });
      el.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          el.click();
        }
      });
    });
  }

  searchBtn.addEventListener("click", doSearch);
  keywordInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") doSearch();
  });

  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });
}
