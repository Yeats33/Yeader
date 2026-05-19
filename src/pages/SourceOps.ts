import { navigate } from "../router.ts";
import { listYeaderSources } from "../api.ts";
import type { YeaderSource } from "../types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSourceOpsPage(): string {
  return `
    <div class="page page-source-ops">
      <header class="page-header">
        <button class="btn-icon" data-nav="/" title="返回书架">&#x2190;</button>
        <h1>书源管理</h1>
        <button class="btn-icon" data-nav="/settings" title="设置">&#x2699;</button>
      </header>

      <div class="source-ops-shell">
        <div class="source-ops-tabs">
          <button class="tab-btn active" data-tab="import">链接导入</button>
          <button class="tab-btn" data-tab="sources">书源列表</button>
        </div>

        <div id="source-ops-content" class="source-ops-content">
          <div class="loading">加载中...</div>
        </div>
      </div>
    </div>
  `;
}

export async function initSourceOpsHandlers(container: HTMLElement): Promise<void> {
  const content = container.querySelector<HTMLElement>("#source-ops-content");
  const tabBtns = container.querySelectorAll<HTMLElement>(".tab-btn");

  // Load source list
  let sources: YeaderSource[] = [];
  try {
    sources = await listYeaderSources();
  } catch {
    sources = [];
  }

  function switchTab(tab: string) {
    tabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    if (!content) return;

    if (tab === "import") {
      renderImportTab(content, sources);
    } else {
      renderSourceListTab(content, sources);
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Initialize with import tab
  switchTab("import");

  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });
}

function renderImportTab(container: HTMLElement, sources: YeaderSource[]) {
  const enabledSources = sources.filter((s) => s.enabled);

  if (enabledSources.length === 0) {
    container.innerHTML = `
      <div class="source-ops-panel">
        <div class="empty-state">
          <p>暂无启用的书源，请先在设置中添加书源。</p>
        </div>
      </div>
    `;
    return;
  }

  // Build source options
  const sourceOptions = enabledSources
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`,
    )
    .join("");

  container.innerHTML = `
    <div class="source-ops-panel import-form">
      <div class="source-ops-panel-header">
        <div>
          <h2>通过链接打开书籍</h2>
          <p class="import-desc">粘贴小说页面链接，自动匹配可用书源并进入在线阅读。</p>
        </div>
        <span class="source-summary-chip available">启用:${enabledSources.length} 全部:${sources.length}</span>
      </div>

      <div class="source-ops-form-grid">
        <div class="form-group">
          <label for="import-source">选择书源</label>
          <select id="import-source" class="form-input">
            ${sourceOptions}
          </select>
        </div>

        <div class="form-group source-ops-url-field">
          <label for="import-url">链接</label>
          <input
            type="text"
            id="import-url"
            class="form-input"
            placeholder="https://czbooks.net/n/..."
            autocomplete="off"
          />
        </div>

        <button class="btn-primary source-ops-submit" id="import-btn">打开</button>
      </div>

      <div id="import-result"></div>
    </div>

    <div id="import-book-info" class="import-book-info" style="display:none;"></div>
  `;

  // URL input for auto-detect source
  const urlInput = container.querySelector<HTMLInputElement>("#import-url");
  const sourceSelect = container.querySelector<HTMLSelectElement>("#import-source");
  const importBtn = container.querySelector<HTMLButtonElement>("#import-btn");
  const resultDiv = container.querySelector<HTMLElement>("#import-result");
  const bookInfoDiv = container.querySelector<HTMLElement>("#import-book-info");

  // Auto-detect source from URL
  urlInput?.addEventListener("input", () => {
    const url = urlInput.value.trim();
    if (!url) return;

    // Try to detect source based on URL patterns
    const matchedSource = detectSourceFromUrl(url, enabledSources);
    if (matchedSource && sourceSelect) {
      sourceSelect.value = matchedSource.id;
    }
  });

  importBtn?.addEventListener("click", async () => {
    if (!urlInput || !sourceSelect || !resultDiv || !bookInfoDiv) return;

    const url = urlInput.value.trim();
    const sourceId = sourceSelect.value;

    if (!url) {
      resultDiv.innerHTML = '<p class="error-msg">请输入链接</p>';
      return;
    }

    const source = enabledSources.find((s) => s.id === sourceId);
    if (!source) {
      resultDiv.innerHTML = '<p class="error-msg">请选择书源</p>';
      return;
    }

    resultDiv.innerHTML = '<div class="loading">导入中...</div>';
    importBtn.disabled = true;

    try {
      // Navigate to online reader with the URL
      const encodedUrl = encodeURIComponent(url);
      const encodedSourceId = encodeURIComponent(source.id);
      navigate(`/online-reader/${encodedUrl}/${encodedSourceId}`);
    } catch (e) {
      resultDiv.innerHTML = `<p class="error-msg">导入失败: ${e instanceof Error ? e.message : String(e)}</p>`;
    } finally {
      importBtn.disabled = false;
    }
  });
}

function renderSourceListTab(container: HTMLElement, sources: YeaderSource[]) {
  if (sources.length === 0) {
    container.innerHTML = `
      <div class="source-ops-panel">
        <div class="empty-state">
          <p>暂无书源，请导入书源配置。</p>
        </div>
      </div>
    `;
    return;
  }

  const enabledCount = sources.filter((s) => s.enabled).length;

  const sourceCards = sources
    .map((s) => {
      const caps = s.capabilities || [];
      const capTags = caps.map((c) => `<span class="cap-tag">${c.kind}</span>`).join("");

      return `
        <div class="source-card" data-source-id="${escapeHtml(s.id)}">
          <div class="source-card-header">
            <h3>${escapeHtml(s.name)}</h3>
            <span class="source-status ${s.enabled ? "enabled" : "disabled"}">${s.enabled ? "启用" : "禁用"}</span>
          </div>
          <div class="source-card-meta">
            ${s.homepage ? `<a href="${escapeHtml(s.homepage)}" target="_blank">${escapeHtml(s.homepage)}</a>` : ""}
          </div>
          <div class="source-card-caps">
            ${capTags || "<span class='muted-text'>无能力定义</span>"}
          </div>
          <div class="source-card-tags">
            ${(s.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="source-ops-panel">
      <div class="source-ops-panel-header">
        <div>
          <h2>Yeader 书源</h2>
          <p class="import-desc">当前可用于在线搜索、详情、目录和正文抓取的书源。</p>
        </div>
        <span class="source-summary-chip available">启用:${enabledCount} 全部:${sources.length}</span>
      </div>
      <div class="source-list">
        ${sourceCards}
      </div>
    </div>
  `;
}

function detectSourceFromUrl(url: string, sources: YeaderSource[]): YeaderSource | null {
  for (const source of sources) {
    // Try to match URL against source homepage or known patterns
    try {
      const urlObj = new URL(url);
      if (source.homepage) {
        const homeObj = new URL(source.homepage);
        if (urlObj.host === homeObj.host) {
          return source;
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }
  return null;
}
