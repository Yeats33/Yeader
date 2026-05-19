import { navigate } from "../router.ts";
import { checkCommandExists, getCommandVersion, openUrl, startSoNovelWebui, isSoNovelRunning, stopSoNovel } from "../api.ts";
import { restoreSession, onSessionChange, getSessionState, logout } from "../auth/session.ts";
import { connectWallet, signIn, setupAccountListener } from "../auth/login.ts";

const SO_NOVEL_GITHUB = "https://github.com/freeok/so-novel";
const SO_NOVEL_DESC = "一款通用的网页内容处理与导出工具，可将网页提取为 EPUB、TXT、PDF 等多种格式。";

type IntegrationStatus = "checking" | "installed" | "missing";
type LoginStep = "idle" | "connecting" | "signing" | "authenticated";

function describeSoNovelCard(
  status: IntegrationStatus,
  version: string = "",
  running: boolean | null = null,
): string {
  const statusChip = {
    checking: `<span class="integration-status-chip integration-status-chip--checking">检查中...</span>`,
    installed: running === true
      ? `<span class="integration-status-chip integration-status-chip--enabled">运行中</span>`
      : `<span class="integration-status-chip integration-status-chip--enabled">已安装</span>`,
    missing: `<span class="integration-status-chip integration-status-chip--missing">未安装</span>`,
  }[status];

  const versionTag = status === "installed" && version
    ? `<span class="integration-version-tag">${version}</span>`
    : "";

  const descText = {
    checking: "正在检查安装状态...",
    installed: SO_NOVEL_DESC,
    missing: "点击安装以启用",
  }[status];

  let actionBtns = "";

  if (status === "missing") {
    actionBtns = `<button class="btn-primary" data-integration-action="install" data-integration="so-novel">前往安装</button>`;
  } else if (status === "installed") {
    if (running === true) {
      actionBtns = `
        <button class="btn-secondary" data-integration-action="stop" data-integration="so-novel">停止</button>
        <button class="btn-secondary" data-integration-action="webui" data-integration="so-novel">WebUI</button>
      `;
    } else {
      actionBtns = `
        <button class="btn-secondary" data-integration-action="start" data-integration="so-novel">运行</button>
      `;
    }
    actionBtns += `
      <button class="btn-secondary" data-integration-action="config" data-integration="so-novel">配置</button>
      <button class="btn-secondary" data-integration-action="rules" data-integration="so-novel">规则</button>
    `;
  }

  return `
    <div class="integration-card" data-integration="so-novel">
      <div class="integration-card-icon">
        <img src="/so-novel-logo.png" alt="so-novel logo" width="48" height="48" />
      </div>
      <div class="integration-card-info">
        <strong class="integration-card-name">so-novel</strong>
        <span class="integration-card-desc">${descText}</span>
      </div>
      <div class="integration-card-status">
        ${statusChip}${versionTag}
      </div>
      <div class="integration-card-actions">
        ${actionBtns}
      </div>
    </div>
  `;
}

function renderAuthGate(step: LoginStep): string {
  const state = getSessionState();

  if (state.status === "authenticated") {
    return `
      <div class="auth-gate auth-gate--connected">
        <span class="auth-gate__address">
          ${state.walletAddress?.slice(0, 6)}...${state.walletAddress?.slice(-4)}
        </span>
        <button class="btn-secondary btn-sm" id="disconnect-wallet">断开</button>
      </div>
    `;
  }

  if (step === "connecting") {
    return `<div class="auth-gate auth-gate--checking">等待钱包连接...</div>`;
  }

  if (step === "signing") {
    return `<div class="auth-gate auth-gate--checking">请在钱包中签名...</div>`;
  }

  return `
    <div class="auth-gate auth-gate--connect">
      <span>连接钱包以使用集成功能</span>
      <button class="btn-primary" id="connect-wallet-btn">连接钱包</button>
    </div>
  `;
}

function renderIntegrationContent(): string {
  const isAuth = getSessionState().status === "authenticated";

  return `
    <section class="settings-section">
      <div class="section-header">
        <h2>已安装</h2>
      </div>
      ${isAuth ? `<div class="integration-list" id="integration-list">
        ${describeSoNovelCard("checking")}
      </div>` : `<p class="muted-text">请先连接钱包以使用集成功能</p>`}
    </section>

    ${isAuth ? `<section class="settings-section">
      <div class="section-header">
        <h2>可用集成</h2>
      </div>
      <div class="integration-list integration-list--available" id="available-integration-list">
        <div class="integration-coming-soon">
          <span>更多集成正在开发中...</span>
        </div>
      </div>
    </section>` : ""}
  `;
}

export function renderIntegrationPage(): string {
  return `
    <div class="page page-integration">
      <header class="page-header">
        <h1>集成</h1>
        <button class="btn-icon" data-nav="/" title="返回">&#x2190;</button>
      </header>

      <div id="auth-gate-container">
        ${renderAuthGate("idle")}
      </div>

      <div id="integration-content">
        ${renderIntegrationContent()}
      </div>
    </div>
  `;
}

function refreshAuthUI(container: HTMLElement, step: LoginStep): void {
  const gateEl = container.querySelector<HTMLElement>("#auth-gate-container");
  const contentEl = container.querySelector<HTMLElement>("#integration-content");
  if (gateEl) gateEl.innerHTML = renderAuthGate(step);
  if (contentEl) {
    contentEl.innerHTML = renderIntegrationContent();
    initSoNovelHandlers(container);
  }
  attachAuthButtons(container, step);
}

function attachAuthButtons(container: HTMLElement, _step: LoginStep): void {
  container.querySelector<HTMLButtonElement>("#connect-wallet-btn")?.addEventListener("click", async () => {
    try {
      refreshAuthUI(container, "connecting");
      await connectWallet();
    } catch {
      refreshAuthUI(container, "idle");
    }
  });

  container.querySelector<HTMLButtonElement>("#disconnect-wallet")?.addEventListener("click", async () => {
    await logout();
    refreshAuthUI(container, "idle");
  });
}

function initSoNovelHandlers(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  if (getSessionState().status !== "authenticated") return;

  const integrationList = container.querySelector<HTMLElement>("#integration-list");

  async function checkSoNovel() {
    const card = integrationList?.querySelector<HTMLElement>("[data-integration='so-novel']");
    if (!card) return;

    const installed = await checkCommandExists("so-novel");
    if (!installed) {
      card.innerHTML = describeSoNovelCard("missing");
      attachCardHandlers();
      return;
    }

    let version = "";
    try {
      const raw = await getCommandVersion("so-novel");
      version = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
    } catch {
      // version check optional
    }

    const running = await isSoNovelRunning();
    card.innerHTML = describeSoNovelCard("installed", version, running);
    attachCardHandlers();
  }

  function attachCardHandlers() {
    integrationList?.querySelectorAll<HTMLButtonElement>("[data-integration-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.integrationAction;

        if (action === "install") {
          await openUrl(SO_NOVEL_GITHUB);
        }

        if (action === "start") {
          try {
            await startSoNovelWebui();
            await checkSoNovel();
          } catch (e) {
            alert(`启动失败: ${e}`);
          }
        }

        if (action === "stop") {
          try {
            await stopSoNovel();
            await checkSoNovel();
          } catch (e) {
            alert(`停止失败: ${e}`);
          }
        }

        if (action === "webui") {
          navigate("/integration/so-novel/webui");
        }

        if (action === "config") {
          navigate("/integration/so-novel/config");
        }

        if (action === "rules") {
          navigate("/integration/so-novel/rules");
        }
      });
    });
  }

  checkSoNovel();
}

export function initIntegrationPage(container: HTMLElement): void {
  attachAuthButtons(container, "idle");

  // Restore session
  restoreSession().then(() => {
    const state = getSessionState();
    refreshAuthUI(container, state.status === "authenticated" ? "authenticated" : "idle");
  });

  // Detect wallet connection → auto sign-in
  setupAccountListener(async (address) => {
    if (address && getSessionState().status !== "authenticated") {
      refreshAuthUI(container, "signing");
      try {
        await signIn();
        refreshAuthUI(container, "authenticated");
      } catch {
        refreshAuthUI(container, "idle");
      }
    }
    if (!address && getSessionState().status === "authenticated") {
      await logout();
      refreshAuthUI(container, "idle");
    }
  });

  onSessionChange(() => {
    refreshAuthUI(container, getSessionState().status === "authenticated" ? "authenticated" : "idle");
  });
}
