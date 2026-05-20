import { useEffect, useState } from "react";
import { navigate } from "../router.ts";
import { startSoNovelWebui } from "../api.ts";

const WEBUI_PORT = 7765;
const WEBUI_URL = `http://localhost:${WEBUI_PORT}`;

async function waitForWebui(timeout = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(WEBUI_URL, { mode: "no-cors" });
      return;
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }
  throw new Error("WebUI 启动超时");
}

export function SoNovelWebuiPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hint, setHint] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function startWebui() {
      setStatus("loading");
      setHint("");
      try {
        await startSoNovelWebui();
        await waitForWebui();
        if (!cancelled) {
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setHint(`启动失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    void startWebui();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page page-webui">
      <header className="page-header">
        <h1>so-novel WebUI</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/integration")} title="返回">
          &#x2190;
        </button>
      </header>
      <div className="webui-container">
        {status !== "ready" ? (
          <div className="webui-loading">
            <p>正在启动 so-novel WebUI...</p>
            {hint ? <p className="webui-hint">{hint}</p> : null}
          </div>
        ) : null}
        <iframe
          className="webui-iframe"
          src={status === "ready" ? WEBUI_URL : ""}
          style={{ display: status === "ready" ? "block" : "none" }}
          allow="cross-origin-isolated"
          title="so-novel WebUI"
        />
      </div>
    </div>
  );
}
