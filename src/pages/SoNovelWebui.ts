import { navigate } from "../router.ts";
import { startSoNovelWebui } from "../api.ts";

const WEBUI_PORT = 7765;

export function renderSoNovelWebuiPage(): string {
  return `
    <div class="page page-webui">
      <header class="page-header">
        <h1>so-novel WebUI</h1>
        <button class="btn-icon" data-nav="/integration" title="返回">&#x2190;</button>
      </header>
      <div class="webui-container" id="webui-container">
        <div class="webui-loading" id="webui-loading">
          <p>正在启动 so-novel WebUI...</p>
          <p class="webui-hint" id="webui-hint"></p>
        </div>
        <iframe
          id="so-novel-iframe"
          class="webui-iframe"
          src=""
          style="display:none;"
          allow="cross-origin-isolated"
        ></iframe>
      </div>
    </div>
  `;
}

export async function initSoNovelWebuiHandlers(container: HTMLElement): Promise<void> {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const iframe = container.querySelector<HTMLIFrameElement>("#so-novel-iframe");
  const loading = container.querySelector<HTMLElement>("#webui-loading");
  const hint = container.querySelector<HTMLElement>("#webui-hint");

  async function waitForWebui(port: number, timeout: number = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await fetch(`http://localhost:${port}`, { mode: "no-cors" });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error("WebUI 启动超时");
  }

  try {
    await startSoNovelWebui();
    await waitForWebui(WEBUI_PORT);
    if (iframe) iframe.src = `http://localhost:${WEBUI_PORT}`;
    if (loading) loading.style.display = "none";
    if (iframe) iframe.style.display = "block";
  } catch (e) {
    if (hint) hint.textContent = `启动失败: ${e}`;
  }
}
