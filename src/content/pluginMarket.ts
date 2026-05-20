export type PluginIdentityVerification = "unverified" | "signature-pending" | "verified";
export type PluginActivationMode = "free" | "token-transfer";
export type DonationChain = "evm" | "tron" | "bitcoin" | "solana";

export interface PluginRegistry {
  format: "yeader.plugin-registry";
  version: number;
  plugins: PluginRegistryEntry[];
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  license: string;
  sourceRepo: string;
  identity: PluginIdentity;
  donations: PluginDonation[];
  activation: PluginActivation;
  releaseUrl: string;
  sha256: string;
  runtime: "wasm32-wasip1";
  capabilities: string[];
  network: string[];
  risk: PluginRisk;
  review: PluginReview;
}

export interface PluginIdentity {
  chain: "evm";
  address: string;
  verification: PluginIdentityVerification;
  proof: string;
}

export interface PluginDonation {
  chain: DonationChain;
  address: string;
  label: string;
}

export type PluginActivation =
  | { mode: "free" }
  | {
      mode: "token-transfer";
      token: {
        chain: "evm";
        chainId: number;
        standard: "erc20";
        contract: string;
        symbol: string;
        decimals: number;
        minAmount: string;
        recipient: string;
        verification: "onchain-transfer";
        loginRequired: true;
      };
    };

export interface PluginRisk {
  requiresLogin: boolean;
  touchesPaidContent: boolean;
  usesAntiBotWorkarounds: boolean;
  requiresBrowserRendering: boolean;
}

export interface PluginReview {
  status: "example" | "pending" | "approved" | "rejected" | "removed";
  notes: string;
}

export interface PluginActivationSummary {
  label: string;
  loginRequired: boolean;
  detail: string;
}

export function summarizePluginActivation(activation: PluginActivation): PluginActivationSummary {
  if (activation.mode === "free") {
    return {
      label: "免费",
      loginRequired: false,
      detail: "无需登录即可启用",
    };
  }

  const { token } = activation;
  return {
    label: "Token 启用",
    loginRequired: true,
    detail: `EVM ${token.chainId} · ${token.minAmount} ${token.symbol} · ${token.contract}`,
  };
}

export function identityVerificationLabel(verification: PluginIdentityVerification): string {
  if (verification === "verified") {
    return "已验证";
  }
  if (verification === "signature-pending") {
    return "待验证";
  }
  return "未验证";
}
