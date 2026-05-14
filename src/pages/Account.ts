import { restoreSession, onSessionChange, getSessionState, logout } from "../auth/session.ts";
import { connectWallet, signIn, setupAccountListener } from "../auth/login.ts";
import type { AuthState } from "../auth/types.ts";

type LoginStep = "idle" | "connecting" | "signing" | "authenticated";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  137: "Polygon",
  56: "BSC",
  42161: "Arbitrum",
  10: "Optimism",
};

function chainName(chainId: number | null): string {
  if (chainId === null) return "—";
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

function renderAccountContent(state: AuthState, step: LoginStep): string {
  if (state.status === "authenticated") {
    return `
      <div class="account-info">
        <div class="account-avatar">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-1"/></svg>
        </div>

        <div class="account-field">
          <span class="account-field-label">钱包地址</span>
          <div class="account-field-value account-field-value--mono">
            <span class="account-address-full">${state.walletAddress}</span>
            <button class="btn-icon btn-sm account-copy-btn" data-copy="${state.walletAddress}" title="复制地址">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
        </div>

        <div class="account-field">
          <span class="account-field-label">网络</span>
          <span class="account-field-value">${chainName(state.chainId)}</span>
        </div>

        <div class="account-field">
          <span class="account-field-label">Chain ID</span>
          <span class="account-field-value account-field-value--mono">${state.chainId}</span>
        </div>

        <div class="account-actions">
          <button class="btn-secondary" id="disconnect-wallet">断开连接</button>
        </div>
      </div>
    `;
  }

  if (step === "connecting") {
    return `
      <div class="account-empty">
        <div class="account-loading-spinner"></div>
        <p>等待钱包连接...</p>
      </div>
    `;
  }

  if (step === "signing") {
    return `
      <div class="account-empty">
        <div class="account-loading-spinner"></div>
        <p>请在钱包中签名以验证身份...</p>
      </div>
    `;
  }

  return `
    <div class="account-empty">
      <div class="account-empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-1"/></svg>
      </div>
      <p>未连接钱包</p>
      <button class="btn-primary" id="connect-wallet-btn">连接钱包</button>
    </div>
  `;
}

export async function renderAccountPage(): Promise<string> {
  const state = getSessionState();

  return `
    <div class="page page-account">
      <header class="page-header">
        <h1>账户</h1>
      </header>

      <div id="account-content">
        ${renderAccountContent(state, "idle")}
      </div>
    </div>
  `;
}

function refreshUI(container: HTMLElement, step: LoginStep): void {
  const contentEl = container.querySelector<HTMLElement>("#account-content");
  if (contentEl) {
    contentEl.innerHTML = renderAccountContent(getSessionState(), step);
  }
  attachHandlers(container);
}

function attachHandlers(container: HTMLElement): void {
  container.querySelector<HTMLButtonElement>("#connect-wallet-btn")?.addEventListener("click", async () => {
    try {
      refreshUI(container, "connecting");
      await connectWallet();
    } catch (e) {
      console.error("Connect wallet failed:", e);
      refreshUI(container, "idle");
    }
  });

  container.querySelector<HTMLButtonElement>("#disconnect-wallet")?.addEventListener("click", async () => {
    await logout();
    refreshUI(container, "idle");
  });

  container.querySelectorAll<HTMLButtonElement>(".account-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.dataset.copy;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          btn.classList.add("copied");
          setTimeout(() => btn.classList.remove("copied"), 1500);
        });
      }
    });
  });
}

export function initAccountPage(container: HTMLElement): void {
  // Try to restore existing session first
  restoreSession().then(() => {
    const state = getSessionState();
    refreshUI(container, state.status === "authenticated" ? "authenticated" : "idle");
  });

  // Detect wallet connection → auto sign-in
  setupAccountListener(async (address) => {
    if (address && getSessionState().status !== "authenticated") {
      refreshUI(container, "signing");
      try {
        await signIn();
        refreshUI(container, "authenticated");
      } catch (e) {
        console.error("Sign in failed:", e);
        refreshUI(container, "idle");
      }
    }
    if (!address && getSessionState().status === "authenticated") {
      await logout();
      refreshUI(container, "idle");
    }
  });

  // Listen for session changes
  onSessionChange(() => {
    refreshUI(container, getSessionState().status === "authenticated" ? "authenticated" : "idle");
  });
}
