import type { AppShellSnapshot } from "./api.ts";

function renderImportChannels(snapshot: AppShellSnapshot): string {
  return snapshot.importChannels
    .map(
      (channel) => `
        <article class="panel-card">
          <h3>${channel.name}</h3>
          <p>${channel.description}</p>
        </article>
      `,
    )
    .join("");
}

function renderBookshelf(snapshot: AppShellSnapshot): string {
  return snapshot.bookshelf
    .map(
      (book) => `
        <li class="bookshelf-item">
          <strong>${book.title}</strong>
          <span>${book.author}</span>
          <em>${book.progressLabel}</em>
        </li>
      `,
    )
    .join("");
}

function renderCapabilities(snapshot: AppShellSnapshot): string {
  return snapshot.apiCapabilities
    .map(
      (capability) => `
        <li class="capability-item">
          <span>${capability.label}</span>
          <span class="status-tag">${capability.status}</span>
        </li>
      `,
    )
    .join("");
}

export function renderAppShell(snapshot: AppShellSnapshot): string {
  return `
    <main class="app-shell">
      <section class="hero-card">
        <p class="eyebrow">Rust + Tauri 三端重构</p>
        <h1>Yeader Workbench</h1>
        <p class="hero-copy">面向移动端、桌面端与 Web 端的一体化阅读器工作台。</p>
        <p class="runtime-note">${snapshot.runtime.note}</p>
      </section>

      <section class="panel-grid">
        <section class="panel">
          <header class="panel-header">
            <h2>书源管理</h2>
            <p>导入渠道与兼容能力预览</p>
          </header>
          <div class="panel-stack">${renderImportChannels(snapshot)}</div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <h2>书架预览</h2>
            <p>当前展示模拟数据，用于占位前端结构。</p>
          </header>
          <ul class="bookshelf-list">${renderBookshelf(snapshot)}</ul>
        </section>

        <section class="panel">
          <header class="panel-header">
            <h2>搜索聚合</h2>
            <p>后端能力状态与后续接线位。</p>
          </header>
          <ul class="capability-list">${renderCapabilities(snapshot)}</ul>
        </section>
      </section>
    </main>
  `;
}
