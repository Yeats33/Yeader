import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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

function WalletIcon({ size = 40 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1v-1" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function LoadingAccount({ children }: { children: ReactNode }) {
  return (
    <div className="account-empty">
      <div className="account-loading-spinner" />
      <p>{children}</p>
    </div>
  );
}

function AuthenticatedAccount({ state }: { state: AuthState }) {
  const [copied, setCopied] = useState(false);
  const walletAddress = state.walletAddress ?? "";

  async function copyAddress(): Promise<void> {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="account-info">
      <div className="account-avatar">
        <WalletIcon />
      </div>

      <div className="account-field">
        <span className="account-field-label">钱包地址</span>
        <div className="account-field-value account-field-value--mono">
          <span className="account-address-full">{walletAddress}</span>
          <button
            className={`btn-icon btn-sm account-copy-btn ${copied ? "copied" : ""}`}
            title="复制地址"
            type="button"
            onClick={() => void copyAddress()}
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      <div className="account-field">
        <span className="account-field-label">网络</span>
        <span className="account-field-value">{chainName(state.chainId)}</span>
      </div>

      <div className="account-field">
        <span className="account-field-label">Chain ID</span>
        <span className="account-field-value account-field-value--mono">{state.chainId}</span>
      </div>

      <div className="account-actions">
        <button className="btn-secondary" type="button" onClick={() => void logout()}>
          断开连接
        </button>
      </div>
    </div>
  );
}

function AccountContent({ state, step, setStep }: {
  state: AuthState;
  step: LoginStep;
  setStep: (step: LoginStep) => void;
}) {
  if (state.status === "authenticated") {
    return <AuthenticatedAccount state={state} />;
  }

  if (step === "connecting") {
    return <LoadingAccount>等待钱包连接...</LoadingAccount>;
  }

  if (step === "signing") {
    return <LoadingAccount>请在钱包中签名以验证身份...</LoadingAccount>;
  }

  return (
    <div className="account-empty">
      <div className="account-empty-icon">
        <WalletIcon size={48} />
      </div>
      <p>未连接钱包</p>
      <button
        className="btn-primary"
        id="connect-wallet-btn"
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

export function AccountPage() {
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

    onSessionChange((nextState) => {
      if (!disposed) {
        setState(nextState);
        setStep(nextState.status === "authenticated" ? "authenticated" : "idle");
      }
    });

    setupAccountListener(async (address) => {
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
    };
  }, []);

  return (
    <div className="page page-account">
      <header className="page-header">
        <h1>账户</h1>
      </header>

      <div id="account-content">
        <AccountContent state={state} step={step} setStep={setStep} />
      </div>
    </div>
  );
}
