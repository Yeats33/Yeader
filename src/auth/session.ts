import { getAuthSession, clearAuthSession } from "../api.ts";
import type { AuthSessionInfo } from "../types.ts";
import { AUTH_CHECKING, type AuthState } from "./types.ts";

let currentSession: AuthState = { ...AUTH_CHECKING };
let sessionListeners: Array<(state: AuthState) => void> = [];

export function onSessionChange(fn: (state: AuthState) => void): () => void {
  sessionListeners.push(fn);
  return () => {
    sessionListeners = sessionListeners.filter((listener) => listener !== fn);
  };
}

function notifyListeners(): void {
  for (const fn of sessionListeners) {
    fn({ ...currentSession });
  }
}

export function getSessionState(): AuthState {
  return { ...currentSession };
}

export async function restoreSession(): Promise<AuthState> {
  try {
    const session: AuthSessionInfo | null = await getAuthSession();
    if (session) {
      currentSession = {
        status: "authenticated",
        walletAddress: session.wallet_address,
        chainId: session.chain_id,
      };
    } else {
      currentSession = {
        status: "unauthenticated",
        walletAddress: null,
        chainId: null,
      };
    }
  } catch {
    currentSession = {
      status: "unauthenticated",
      walletAddress: null,
      chainId: null,
    };
  }
  notifyListeners();
  return currentSession;
}

export function setAuthenticated(address: string, chainId: number): void {
  currentSession = {
    status: "authenticated",
    walletAddress: address,
    chainId,
  };
  notifyListeners();
}

export async function logout(): Promise<void> {
  try {
    await clearAuthSession();
  } catch {
    // Ignore errors during logout
  }
  currentSession = {
    status: "unauthenticated",
    walletAddress: null,
    chainId: null,
  };
  notifyListeners();
}
