export interface AuthState {
  status: "checking" | "authenticated" | "unauthenticated";
  walletAddress: string | null;
  chainId: number | null;
}

export const AUTH_CHECKING: AuthState = {
  status: "checking",
  walletAddress: null,
  chainId: null,
};
