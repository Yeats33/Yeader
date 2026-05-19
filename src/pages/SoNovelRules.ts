import { navigate } from "../router.ts";
import {
  listSoNovelRules,
  importSoNovelRule,
  deleteSoNovelRule,
  getSoNovelActiveRule,
  setSoNovelActiveRule,
} from "../api.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const OFFICIAL_RULES = [
  {
    name: "main",
    label: "main.json",
    desc: "官方默认规则，覆盖绝大多数书源",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/main.json",
  },
  {
    name: "cloudflare",
    label: "cloudflare.json",
    desc: "用于需要绕过 Cloudflare 验证的站点",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/cloudflare.json",
  },
  {
    name: "no-search",
    label: "no-search.json",
    desc: "仅支持批量下载，不支持搜索的规则",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/no-search.json",
  },
  {
    name: "proxy-required",
    label: "proxy-required.json",
    desc: "需要代理才能访问的站点规则",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/proxy-required.json",
  },
  {
    name: "rate-limit",
    label: "rate-limit.json",
    desc: "限流站点规则，降低并发避免封号",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/rate-limit.json",
  },
];

export function renderSoNovelRulesPage(): string {
  return `
    <div class="page page-integration">
      <header class="page-header">
        <h1>规则管理</h1>
        <button class="btn-icon" data-nav="/integration" title="返回">&#x2190;</button>
      </header>

      <section class="settings-section">
        <div class="section-header">
          <h2>当前激活</h2>
        </div>
        <div id="active-rule-display" class="active-rule-display">
          <span class="loading">加载中...</span>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h2>自定义规则</h2>
          <div class="section-actions">
            <button class="btn-secondary" id="import-rule-btn">导入规则</button>
          </div>
        </div>
        <div id="custom-rules-list" class="rules-list">
          <div class="loading">加载中...</div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-header">
          <h2>官方规则</h2>
        </div>
        <div id="official-rules-list" class="rules-list">
          <div class="loading">加载中...</div>
        </div>
      </section>

      <div id="import-modal" class="modal-overlay closed">
        <div class="modal">
          <div class="modal-header">
            <h3>导入自定义规则</h3>
            <button class="btn-icon" id="close-modal-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>规则名称</label>
              <input type="text" id="import-rule-name" class="form-input" placeholder="例如 my-rule" />
            </div>
            <div class="form-group">
              <label>JSON 内容</label>
              <textarea id="import-rule-content" class="form-textarea" placeholder="粘贴 JSON 内容..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="cancel-import-btn">取消</button>
            <button class="btn-primary" id="confirm-import-btn">导入</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function initSoNovelRulesHandlers(container: HTMLElement): Promise<void> {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const activeDisplay = container.querySelector<HTMLElement>("#active-rule-display");
  const customList = container.querySelector<HTMLElement>("#custom-rules-list");
  const officialList = container.querySelector<HTMLElement>("#official-rules-list");
  const importModal = container.querySelector<HTMLElement>("#import-modal");
  const importBtn = container.querySelector<HTMLButtonElement>("#import-rule-btn");
  const closeModalBtn = container.querySelector<HTMLButtonElement>("#close-modal-btn");
  const cancelImportBtn = container.querySelector<HTMLButtonElement>("#cancel-import-btn");
  const confirmImportBtn = container.querySelector<HTMLButtonElement>("#confirm-import-btn");

  let customRules: string[] = [];
  let activeRule = "";

  async function loadRules() {
    try {
      [customRules, activeRule] = await Promise.all([
        listSoNovelRules(),
        getSoNovelActiveRule(),
      ]);
    } catch {
    }
  }

  function isOfficialInstalled(label: string): boolean {
    return customRules.includes(label.replace(".json", ""));
  }

  function isOfficialActive(label: string): boolean {
    return activeRule === label;
  }

  function renderOfficialRules() {
    if (!officialList) return;
    officialList.innerHTML = OFFICIAL_RULES.map((r) => {
      const installed = isOfficialInstalled(r.label);
      const isActive = isOfficialActive(r.label);

      let actionBtns = "";
      if (!installed) {
        actionBtns = `<button class="btn-secondary btn-sm" data-action="download-official" data-url="${r.url}" data-name="${r.name}" data-label="${r.label}">下载</button>`;
      } else if (isActive) {
        actionBtns = `<span class="rule-active-badge">已激活</span>`;
      } else {
        actionBtns = `
          <button class="btn-secondary btn-sm" data-action="update-official" data-url="${r.url}" data-name="${r.name}" data-label="${r.label}">更新</button>
          <button class="btn-secondary btn-sm" data-action="activate-official" data-name="${r.name}" data-label="${r.label}">激活</button>
        `;
      }

      return `
        <div class="rule-item">
          <div class="rule-item-info">
            <strong class="rule-item-name">${r.label}</strong>
            <span class="rule-item-desc">${r.desc}</span>
          </div>
          <div class="rule-item-actions">
            ${actionBtns}
          </div>
        </div>
      `;
    }).join("");
  }

  async function render() {
    await loadRules();

    // Active rule
    if (activeDisplay) {
      activeDisplay.innerHTML = `<span class="active-rule-name">${escapeHtml(activeRule)}</span>`;
    }

    // Custom rules
    if (customList) {
      if (customRules.length === 0) {
        customList.innerHTML = `<div class="empty-state">暂无自定义规则</div>`;
      } else {
        customList.innerHTML = customRules
          .filter((name) => !OFFICIAL_RULES.some((r) => r.name === name))
          .map((name) => {
            const isActive = activeRule === name + ".json";
            const safeName = escapeHtml(name);
            return `
              <div class="rule-item">
                <div class="rule-item-info">
                  <strong class="rule-item-name">${safeName}.json</strong>
                  ${isActive ? '<span class="rule-active-badge">已激活</span>' : ""}
                </div>
                <div class="rule-item-actions">
                  ${!isActive ? `<button class="btn-secondary btn-sm" data-action="activate-custom" data-name="${safeName}">激活</button>` : ""}
                  <button class="btn-danger btn-sm" data-action="delete-custom" data-name="${safeName}">删除</button>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    renderOfficialRules();
    attachHandlers();
  }

  function attachHandlers() {
    // Official rules: download
    officialList?.querySelectorAll<HTMLButtonElement>("[data-action='download-official']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.url!;
        const name = btn.dataset.name!;
        const label = btn.dataset.label!;
        btn.textContent = "下载中...";
        btn.disabled = true;
        try {
          const res = await fetch(url);
          const content = await res.text();
          await importSoNovelRule(name, content);
          await setSoNovelActiveRule(label);
          await render();
        } catch (e) {
          alert(`下载失败: ${e}`);
          btn.textContent = "下载";
          btn.disabled = false;
        }
      });
    });

    // Official rules: update
    officialList?.querySelectorAll<HTMLButtonElement>("[data-action='update-official']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.url!;
        const name = btn.dataset.name!;
        const originalText = btn.textContent;
        btn.textContent = "更新中...";
        btn.disabled = true;
        try {
          const res = await fetch(url);
          const content = await res.text();
          await importSoNovelRule(name, content);
          await render();
        } catch (e) {
          alert(`更新失败: ${e}`);
          btn.textContent = originalText;
          btn.disabled = false;
        }
      });
    });

    // Official rules: activate
    officialList?.querySelectorAll<HTMLButtonElement>("[data-action='activate-official']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const label = btn.dataset.label!;
        try {
          await setSoNovelActiveRule(label);
          await render();
        } catch (e) {
          alert(`激活失败: ${e}`);
        }
      });
    });

    // Custom rules
    customList?.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        const name = btn.dataset.name!;

        if (action === "activate-custom") {
          try {
            await setSoNovelActiveRule(name + ".json");
            await render();
          } catch (e) {
            alert(`激活失败: ${e}`);
          }
        }

        if (action === "delete-custom") {
          if (!confirm(`确定删除规则 ${name}.json？`)) return;
          try {
            await deleteSoNovelRule(name);
            await render();
          } catch (e) {
            alert(`删除失败: ${e}`);
          }
        }
      });
    });
  }

  // Modal handlers
  function openModal() {
    importModal?.classList.remove("hidden");
  }
  function closeModal() {
    importModal?.classList.add("closed");
    const nameInput = container.querySelector<HTMLInputElement>("#import-rule-name");
    const contentInput = container.querySelector<HTMLTextAreaElement>("#import-rule-content");
    if (nameInput) nameInput.value = "";
    if (contentInput) contentInput.value = "";
  }

  importBtn?.addEventListener("click", openModal);
  closeModalBtn?.addEventListener("click", closeModal);
  cancelImportBtn?.addEventListener("click", closeModal);
  importModal?.addEventListener("click", (e) => {
    if (e.target === importModal) closeModal();
  });

  confirmImportBtn?.addEventListener("click", async () => {
    const nameInput = container.querySelector<HTMLInputElement>("#import-rule-name");
    const contentInput = container.querySelector<HTMLTextAreaElement>("#import-rule-content");
    const name = nameInput?.value.trim();
    const content = contentInput?.value.trim();
    if (!name) {
      alert("请输入规则名称");
      return;
    }
    if (!content) {
      alert("请输入 JSON 内容");
      return;
    }
    try {
      await importSoNovelRule(name, content);
      await setSoNovelActiveRule(name + ".json");
      closeModal();
      await render();
    } catch (e) {
      alert(`导入失败: ${e}`);
    }
  });

  await render();
}
