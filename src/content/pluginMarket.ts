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

export interface PluginRegistryView {
  registry: PluginRegistry;
  sourceLabel: string;
  sourceUrl: string;
  readonly: boolean;
  installAvailable: boolean;
}

const PLUGIN_REGISTRY_FORMAT = "yeader.plugin-registry";
export const PLUGIN_REGISTRY_REPOSITORY_URL = "https://github.com/Yeats33/YeaderHub";

const BUNDLED_PLUGIN_REGISTRY_PREVIEW: PluginRegistry = {
  format: PLUGIN_REGISTRY_FORMAT,
  version: 1,
  plugins: [
    {
      id: "example.news",
      name: "Example News",
      version: "0.1.0",
      description: "示例免费插件，展示市场条目和权限结构。",
      license: "MIT",
      sourceRepo: "https://github.com/example/yeader-plugin-example-news",
      identity: {
        chain: "evm",
        address: "0x0000000000000000000000000000000000000000",
        verification: "unverified",
        proof: "",
      },
      donations: [
        {
          chain: "evm",
          address: "0x0000000000000000000000000000000000000000",
          label: "EVM",
        },
      ],
      activation: { mode: "free" },
      releaseUrl: "https://github.com/example/yeader-plugin-example-news/releases/download/v0.1.0/example-news-plugin.tar.gz",
      sha256: "0".repeat(64),
      runtime: "wasm32-wasip1",
      capabilities: ["feed", "search", "content"],
      network: ["https://example.com/*"],
      risk: {
        requiresLogin: false,
        touchesPaidContent: false,
        usesAntiBotWorkarounds: false,
        requiresBrowserRendering: false,
      },
      review: {
        status: "example",
        notes: "Schema preview only.",
      },
    },
    {
      id: "example.paid-news",
      name: "Example Paid News",
      version: "0.1.0",
      description: "示例 Token 启用插件，展示 EVM 历史转账校验字段。",
      license: "MIT",
      sourceRepo: "https://github.com/example/yeader-plugin-example-paid-news",
      identity: {
        chain: "evm",
        address: "0x0000000000000000000000000000000000000000",
        verification: "signature-pending",
        proof: "",
      },
      donations: [],
      activation: {
        mode: "token-transfer",
        token: {
          chain: "evm",
          chainId: 1,
          standard: "erc20",
          contract: "0x0000000000000000000000000000000000000000",
          symbol: "TOKEN",
          decimals: 18,
          minAmount: "10.0",
          recipient: "0x0000000000000000000000000000000000000000",
          verification: "onchain-transfer",
          loginRequired: true,
        },
      },
      releaseUrl: "https://github.com/example/yeader-plugin-example-paid-news/releases/download/v0.1.0/example-paid-news-plugin.tar.gz",
      sha256: "0".repeat(64),
      runtime: "wasm32-wasip1",
      capabilities: ["feed", "content"],
      network: ["https://example.com/*"],
      risk: {
        requiresLogin: false,
        touchesPaidContent: false,
        usesAntiBotWorkarounds: false,
        requiresBrowserRendering: false,
      },
      review: {
        status: "example",
        notes: "Schema preview only.",
      },
    },
  ],
};

export function getBundledPluginRegistryPreview(): PluginRegistryView {
  return {
    registry: BUNDLED_PLUGIN_REGISTRY_PREVIEW,
    sourceLabel: "Yeats33/YeaderHub",
    sourceUrl: PLUGIN_REGISTRY_REPOSITORY_URL,
    readonly: true,
    installAvailable: false,
  };
}

export function pluginRegistryEntries(view: PluginRegistryView): PluginRegistryEntry[] {
  return view.registry.plugins;
}

export function parsePluginRegistry(value: unknown): PluginRegistry | null {
  if (!isObject(value)) {
    return null;
  }

  const registry = value as Partial<PluginRegistry>;
  if (
    registry.format !== PLUGIN_REGISTRY_FORMAT ||
    typeof registry.version !== "number" ||
    !Array.isArray(registry.plugins)
  ) {
    return null;
  }

  return {
    format: registry.format,
    version: registry.version,
    plugins: registry.plugins,
  };
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

export function pluginRiskLabels(risk: PluginRisk): string[] {
  const labels: string[] = [];
  if (risk.requiresLogin) labels.push("站点登录");
  if (risk.touchesPaidContent) labels.push("付费内容");
  if (risk.usesAntiBotWorkarounds) labels.push("反爬适配");
  if (risk.requiresBrowserRendering) labels.push("浏览器渲染");
  return labels;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
