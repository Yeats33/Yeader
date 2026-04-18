import { searchBooks, listBookSources, addBookToShelf } from "../api.ts";
import { navigate } from "../router.ts";
import { $ } from "../query.ts";
import type { SearchResult, LegacyBookSource } from "../types.ts";

export async function renderSearchPage(): Promise<string> {
  let sources: LegacyBookSource[] = [];
  try {
    sources = await listBookSources();
  } catch {
    sources = [];
  }

  const sourceOptions = sources
    .filter((s) => s.enabled)
    .map((s) => `<option value="${s.book_source_url}">${s.book_source_name}</option>`)
    .join("");

  return `
    <div class="page page-search">
      <header class="page-header">
        <h1>搜索</h1>
        <button class="btn-icon" data-nav="/" title="返回书架">&#x2190;</button>
      </header>
      <div class="search-form">
        <select id="search-source" class="search-select">
          <option value="">全部书源</option>
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
    const sourceUrl = sourceSelect.value;

    if (!keyword) return;

    resultsEl.innerHTML = '<div class="loading">搜索中...</div>';
    searchBtn.disabled = true;

    try {
      if (sourceUrl) {
        const results = await searchBooks(sourceUrl, keyword, 1);
        renderResults(results);
      } else {
        const allSources = await listBookSources();
        const enabledSources = allSources.filter((s) => s.enabled);

        const allResults = await Promise.all(
          enabledSources.map((s) => searchBooks(s.book_source_url, keyword, 1)),
        );
        const flat = allResults.flat();
        renderResults(flat);
      }
    } catch {
      resultsEl.innerHTML = '<div class="error-msg">搜索失败，请重试</div>';
    } finally {
      searchBtn.disabled = false;
    }
  }

  function renderResults(results: SearchResult[]) {
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state"><p>未找到相关书籍</p></div>';
      return;
    }

    const cards = results
      .map(
        (r) => `
        <li class="result-card" data-book-url="${r.book_url}" tabindex="0" role="button">
          <div class="result-cover">
            ${r.cover_url ? `<img src="${r.cover_url}" alt="${r.name}" loading="lazy" />` : `<div class="result-cover-placeholder"><span>${r.name.charAt(0)}</span></div>`}
          </div>
          <div class="result-info">
            <h3 class="result-title">${r.name}</h3>
            <p class="result-author">${r.author}</p>
            ${r.intro ? `<p class="result-intro">${r.intro}</p>` : ""}
            ${r.last_chapter ? `<p class="result-chapter">最新: ${r.last_chapter}</p>` : ""}
          </div>
        </li>
      `,
      )
      .join("");

    resultsEl.innerHTML = `<ul class="result-list">${cards}</ul>`;

    resultsEl.querySelectorAll<HTMLElement>("[data-book-url]").forEach((el) => {
      el.addEventListener("click", async () => {
        const bookUrl = el.dataset.bookUrl!;
        await addBookToShelf({
          url: bookUrl,
          name: el.querySelector(".result-title")?.textContent ?? "",
          author: el.querySelector(".result-author")?.textContent ?? "",
          source_url: sourceSelect.value || "",
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
