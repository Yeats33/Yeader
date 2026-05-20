import { useCallback, useEffect, useState } from "react";
import {
  checkCommandExists,
  getCommandVersion,
  isSoNovelRunning,
  openUrl,
  startSoNovelWebui,
  stopSoNovel,
} from "../api.ts";
import { connectWallet, setupAccountListener, signIn } from "../auth/login.ts";
import { getSessionState, logout, onSessionChange, restoreSession } from "../auth/session.ts";
import type { AuthState } from "../auth/types.ts";
import { navigate } from "../routing/hashRoute.ts";
import {
  cleanCommandVersion,
  INITIAL_SO_NOVEL_STATE,
  SO_NOVEL_GITHUB,
  soNovelDescription,
  soNovelStatusLabel,
  type SoNovelState,
} from "./integrationStatus.ts";

type LoginStep = "idle" | "connecting" | "signing" | "authenticated";
type SoNovelAction = "start" | "stop" | null;

function ArrowLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function authAddressLabel(state: AuthState): string {
  const address = state.walletAddress ?? "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function AuthGate({ state, step, setStep }: {
  state: AuthState;
  step: LoginStep;
  setStep: (step: LoginStep) => void;
}) {
  if (state.status === "authenticated") {
    return (
      <div className="auth-gate auth-gate--connected">
        <span className="auth-gate__address">{authAddressLabel(state)}</span>
        <button
          className="btn-secondary btn-sm"
          type="button"
          onClick={() => void logout()}
        >
          断开
        </button>
      </div>
    );
  }

  if (step === "connecting") {
    return <div className="auth-gate auth-gate--checking">等待钱包连接...</div>;
  }

  if (step === "signing") {
    return <div className="auth-gate auth-gate--checking">请在钱包中签名...</div>;
  }

  return (
    <div className="auth-gate auth-gate--connect">
      <span>连接钱包以使用集成功能</span>
      <button
        className="btn-primary"
        type="button"
        onClick={async () => {
          try {
            setStep("connecting");
            await connectWallet();
          } catch {
            setStep("idle");
          }
        }}
      >
        连接钱包
      </button>
    </div>
  );
}

function statusChipClass(state: SoNovelState): string {
  if (state.status === "installed") return "integration-status-chip--enabled";
  if (state.status === "missing") return "integration-status-chip--missing";
  if (state.status === "error") return "integration-status-chip--error";
  return "integration-status-chip--checking";
}

function SoNovelCard({ state, busyAction, onRefresh, onStart, onStop }: {
  state: SoNovelState;
  busyAction: SoNovelAction;
  onRefresh: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const actionDisabled = busyAction !== null || state.status === "checking";

  return (
    <div className="integration-card" data-integration="so-novel">
      <div className="integration-card-icon">
        <img src="/so-novel-logo.png" alt="so-novel logo" width="48" height="48" />
      </div>
      <div className="integration-card-info">
        <strong className="integration-card-name">so-novel</strong>
        <span className="source-status">废弃兼容</span>
        <span className="integration-card-desc">{soNovelDescription(state)}</span>
      </div>
      <div className="integration-card-status">
        <span className={`integration-status-chip ${statusChipClass(state)}`}>
          {soNovelStatusLabel(state)}
        </span>
        {state.status === "installed" && state.version ? (
          <span className="integration-version-tag">{state.version}</span>
        ) : null}
      </div>
      <div className="integration-card-actions">
        {state.status === "missing" ? (
          <button className="btn-primary" type="button" onClick={() => void openUrl(SO_NOVEL_GITHUB)}>
            查看旧项目
          </button>
        ) : null}

        {state.status === "installed" && state.running ? (
          <>
            <button className="btn-secondary" type="button" disabled={actionDisabled} onClick={onStop}>
              {busyAction === "stop" ? "停止中..." : "停止"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => navigate("/integration/so-novel/webui")}>
              WebUI
            </button>
          </>
        ) : null}

        {state.status === "installed" && !state.running ? (
          <button className="btn-secondary" type="button" disabled={actionDisabled} onClick={onStart}>
            {busyAction === "start" ? "启动中..." : "运行"}
          </button>
        ) : null}

        {state.status === "error" ? (
          <button className="btn-secondary" type="button" onClick={onRefresh}>
            重试
          </button>
        ) : null}

        {state.status === "installed" ? (
          <>
            <button className="btn-secondary" type="button" onClick={() => navigate("/integration/so-novel/config")}>
              配置
            </button>
            <button className="btn-secondary" type="button" onClick={() => navigate("/integration/so-novel/rules")}>
              规则
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function IntegrationContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [soNovel, setSoNovel] = useState<SoNovelState>(INITIAL_SO_NOVEL_STATE);
  const [busyAction, setBusyAction] = useState<SoNovelAction>(null);

  const refreshSoNovel = useCallback(() => {
    let cancelled = false;

    async function run() {
      setSoNovel(INITIAL_SO_NOVEL_STATE);
      try {
        const installed = await checkCommandExists("so-novel");
        if (cancelled) return;

        if (!installed) {
          setSoNovel({
            status: "missing",
            version: "",
            running: null,
            error: null,
          });
          return;
        }

        let version = "";
        try {
          version = cleanCommandVersion(await getCommandVersion("so-novel"));
        } catch {
          version = "";
        }

        const running = await isSoNovelRunning();
        if (cancelled) return;

        setSoNovel({
          status: "installed",
          version,
          running,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setSoNovel({
          status: "error",
          version: "",
          running: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    return refreshSoNovel();
  }, [isAuthenticated, refreshSoNovel]);

  async function runAction(action: "start" | "stop"): Promise<void> {
    setBusyAction(action);
    try {
      if (action === "start") {
        await startSoNovelWebui();
      } else {
        await stopSoNovel();
      }
      refreshSoNovel();
    } catch (e) {
      setSoNovel({
        status: "error",
        version: "",
        running: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <section className="settings-section">
        <div className="section-header">
          <h2>已安装</h2>
        </div>
        {isAuthenticated ? (
          <div className="integration-list" id="integration-list">
            <SoNovelCard
              state={soNovel}
              busyAction={busyAction}
              onRefresh={() => refreshSoNovel()}
              onStart={() => void runAction("start")}
              onStop={() => void runAction("stop")}
            />
          </div>
        ) : (
          <p className="muted-text">请先连接钱包以使用集成功能</p>
        )}
      </section>

      {isAuthenticated ? (
        <section className="settings-section">
          <div className="section-header">
            <h2>可用集成</h2>
          </div>
          <div className="integration-list integration-list--available" id="available-integration-list">
            <div className="integration-coming-soon">
              <span>更多集成正在开发中...</span>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

export function IntegrationPage() {
  const [state, setState] = useState<AuthState>(() => getSessionState());
  const [step, setStep] = useState<LoginStep>("idle");

  useEffect(() => {
    let disposed = false;

    restoreSession().then((restored) => {
      if (!disposed) {
        setState(restored);
        setStep(restored.status === "authenticated" ? "authenticated" : "idle");
      }
    });

    const unsubscribeSession = onSessionChange((nextState) => {
      if (!disposed) {
        setState(nextState);
        setStep(nextState.status === "authenticated" ? "authenticated" : "idle");
      }
    });

    const unsubscribeAccount = setupAccountListener(async (address) => {
      if (disposed) return;

      if (address && getSessionState().status !== "authenticated") {
        setStep("signing");
        try {
          await signIn();
          if (!disposed) setStep("authenticated");
        } catch {
          if (!disposed) setStep("idle");
        }
      }

      if (!address && getSessionState().status === "authenticated") {
        await logout();
        if (!disposed) setStep("idle");
      }
    });

    return () => {
      disposed = true;
      unsubscribeAccount();
      unsubscribeSession();
    };
  }, []);

  return (
    <div className="page page-integration">
      <header className="page-header">
        <h1>集成</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/feed")} title="返回订阅">
          <ArrowLeftIcon />
        </button>
      </header>

      <div id="auth-gate-container">
        <AuthGate state={state} step={step} setStep={setStep} />
      </div>

      <div id="integration-content">
        <IntegrationContent isAuthenticated={state.status === "authenticated"} />
      </div>
    </div>
  );
}
