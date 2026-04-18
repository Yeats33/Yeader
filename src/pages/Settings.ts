import {
  listBookSources,
  listReplaceRules,
  deleteBookSource,
  toggleBookSource,
  importBackup,
} from "../api.ts";
import { navigate } from "../router.ts";
import { $ } from "../query.ts";
import type { LegacyBookSource, LegacyReplaceRule } from "../types.ts";

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

  const sourceRows = bookSources
    .map(
      (s) => `
      <tr class="source-row" data-url="${s.book_source_url}">
        <td>${s.book_source_name}</td>
        <td>${s.book_source_group}</td>
        <td>
          <button class="btn-toggle ${s.enabled ? "active" : ""}" data-toggle="source" data-url="${s.book_source_url}">
            ${s.enabled ? "启用" : "禁用"}
          </button>
        </td>
        <td>
          <button class="btn-danger" data-delete="source" data-url="${s.book_source_url}">删除</button>
        </td>
      </tr>
    `,
    )
    .join("");

  const ruleRows = replaceRules
    .map(
      (r) => `
      <tr class="rule-row" data-id="${r.id}">
        <td>${r.name}</td>
        <td><code>${r.pattern}</code></td>
        <td>${r.replacement}</td>
        <td>
          <button class="btn-toggle ${r.enabled ? "active" : ""}" data-toggle="rule" data-id="${String(r.id)}">
            ${r.enabled ? "启用" : "禁用"}
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
          <button class="btn-primary" id="import-source-btn">导入书源</button>
        </div>
        <div class="table-wrapper">
          ${bookSources.length > 0
            ? `<table class="data-table"><thead><tr><th>名称</th><th>分组</th><th>状态</th><th>操作</th></tr></thead><tbody>${sourceRows}</tbody></table>`
            : '<p class="empty-state">暂无书源</p>'}
        </div>
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
    </div>
  `;
}

export function initSettingsHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  container.querySelectorAll<HTMLButtonElement>("[data-toggle='source']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url!;
      const currentState = btn.classList.contains("active");
      const success = await toggleBookSource(url, !currentState);
      if (success) {
        btn.classList.toggle("active", !currentState);
        btn.textContent = !currentState ? "启用" : "禁用";
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-delete='source']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url!;
      if (!confirm("确定要删除该书源吗？")) return;
      const success = await deleteBookSource(url);
      if (success) {
        const row = container.querySelector<HTMLElement>(`.source-row[data-url="${url}"]`);
        row?.remove();
      }
    });
  });

  const importBackupBtn = $<HTMLButtonElement>(container, "#import-backup-btn");
  const importResult = $<HTMLElement>(container, "#import-result");
  const exportBackupBtn = $<HTMLButtonElement>(container, "#export-backup-btn");

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

  exportBackupBtn.addEventListener("click", () => {
    alert("导出功能开发中...");
  });
}
