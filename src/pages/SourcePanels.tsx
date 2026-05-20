import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { navigate } from "../router.ts";
import {
  getBundledPluginRegistryPreview,
  identityVerificationLabel,
  pluginRegistryEntries,
  pluginRiskLabels,
  summarizePluginActivation,
  type PluginActivation,
  type PluginRegistryView,
  type PluginRegistryEntry,
} from "../content/pluginMarket.ts";
import {
  SOURCE_REGISTRY_REPOSITORY_URL,
  SOURCE_REGISTRY_URL,
  parseSourceRegistry,
  type SourceRegistryEntry,
} from "../content/sourceRegistry.ts";
import {
  contentSourceFromYeaderSource,
  filterContentSources,
  sourceKindLabel,
  type SourceKindFilter,
} from "../content/viewModels.ts";
import { importYeaderSourcePackJson, importBookSource, listBookSources, deleteBookSource, toggleBookSource, convertBookSource, searchBooks } from "../api.ts";
import type { YeaderCapability, YeaderSource, LegacyBookSource, SearchResult } from "../types.ts";

function detectSourceFromUrl(url: string, sources: YeaderSource[]): YeaderSource | null {
  for (const source of sources) {
    try {
      const urlObj = new URL(url);
      if (source.homepage) {
        const homeObj = new URL(source.homepage);
        if (urlObj.host === homeObj.host) {
          return source;
        }
      }
    } catch {
    }
  }
  return null;
}

export function ImportTab({ sources }: { sources: YeaderSource[] }) {
  const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);
  const [url, setUrl] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState(() => enabledSources[0]?.id ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabledSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(enabledSources[0]?.id ?? "");
    }
  }, [enabledSources, selectedSourceId]);

  function updateUrl(value: string) {
    setUrl(value);
    setError("");
    const matchedSource = detectSourceFromUrl(value.trim(), enabledSources);
    if (matchedSource) {
      setSelectedSourceId(matchedSource.id);
    }
  }

  function openOnlineReader() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("请输入链接");
      return;
    }

    const source = enabledSources.find((candidate) => candidate.id === selectedSourceId);
    if (!source) {
      setError("请选择来源");
      return;
    }

    navigate(`/online-reader/${encodeURIComponent(trimmedUrl)}/${encodeURIComponent(source.id)}`);
  }

  if (enabledSources.length === 0) {
    return (
      <div className="source-ops-panel">
        <div className="empty-state">
          <p>暂无启用的来源，请先添加规则源、RSS 或插件。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="source-ops-panel import-form">
        <div className="source-ops-panel-header">
          <div>
            <h2>通过链接转换内容</h2>
            <p className="import-desc">粘贴页面链接，自动匹配可用来源并进入统一阅读视图。</p>
          </div>
          <span className="source-summary-chip available">启用:{enabledSources.length} 全部:{sources.length}</span>
        </div>

        <div className="source-ops-form-grid">
          <div className="form-group">
            <label htmlFor="import-source">选择来源</label>
            <select
              id="import-source"
              className="form-input"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
            >
              {enabledSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group source-ops-url-field">
            <label htmlFor="import-url">链接</label>
            <input
              type="text"
              id="import-url"
              className="form-input"
              placeholder="https://czbooks.net/n/..."
              autoComplete="off"
              value={url}
              onChange={(e) => updateUrl(e.target.value)}
            />
          </div>

          <button className="btn-primary source-ops-submit" type="button" onClick={openOnlineReader}>转换</button>
        </div>

        {error ? <div><p className="error-msg">{error}</p></div> : null}
      </div>
      <div className="import-book-info" style={{ display: "none" }} />
    </>
  );
}

function donateAddressFromUrl(donateUrl: string): string {
  if (donateUrl.startsWith("ethereum:")) {
    return donateUrl.slice("ethereum:".length).split(/[?@/]/)[0] ?? donateUrl;
  }

  return donateUrl;
}

function donateNetworkLabel(donateUrl: string): string {
  return donateUrl.startsWith("ethereum:") ? "EVM" : "Link";
}

function shortAddress(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function DonateDialog({ source, onClose }: { source: YeaderSource; onClose: () => void }) {
  const donateUrl = source.donateUrl ?? "";
  const donateAddress = donateAddressFromUrl(donateUrl);
  const networkLabel = donateNetworkLabel(donateUrl);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(donateUrl, {
      errorCorrectionLevel: "M",
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
      margin: 2,
      width: 216,
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [donateUrl]);

  async function copyAddress() {
    await navigator.clipboard.writeText(donateAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="donate-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="donate-modal" role="dialog" aria-modal="true" aria-labelledby="donate-title" onClick={(event) => event.stopPropagation()}>
        <div className="donate-modal-header">
          <div>
            <h3 id="donate-title">支持发布者</h3>
            <p>{source.name}</p>
          </div>
          <button className="btn-icon" type="button" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="donate-publisher-card">
          <span className="donate-network-badge">{networkLabel}</span>
          <div>
            <strong>{source.publisher ?? "Unknown publisher"}</strong>
            <span>{shortAddress(donateAddress)}</span>
          </div>
        </div>

        <div className="donate-qr-frame">
          <div className="donate-qr-surface">
            {qrDataUrl ? <img src={qrDataUrl} alt="Donate QR code" /> : <span className="muted-text">二维码生成失败</span>}
          </div>
          <span>扫码转账或复制地址</span>
        </div>

        <code className="donate-address">{donateAddress}</code>

        <div className="donate-actions">
          <button className="source-donate-btn donate-action-secondary" type="button" onClick={copyAddress}>{copied ? "已复制" : "复制地址"}</button>
          <a className="source-donate-btn donate-action-primary" href={donateUrl} target="_blank" rel="noreferrer">打开钱包链接</a>
        </div>
      </div>
    </div>
  );
}

const capabilityLabels: Record<YeaderCapability["kind"], string> = {
  search: "搜索",
  detail: "详情",
  toc: "目录",
  content: "正文",
  feed: "订阅",
  list: "列表",
  asset: "资源",
};

function capabilitySummary(capability: YeaderCapability): string {
  const parts = [];
  const method = capability.request?.method ?? "GET";
  if (capability.request?.url) {
    parts.push(`${method} ${capability.request.url}`);
  }

  const fieldCount = Object.keys(capability.fields ?? {}).length;
  if (fieldCount > 0) {
    parts.push(`${fieldCount} 个字段`);
  }

  if (capability.actions && capability.actions.length > 0) {
    parts.push(`${capability.actions.length} 个动作`);
  }

  return parts.join(" · ") || "未配置请求";
}

function SourceFeatureList({ source }: { source: YeaderSource }) {
  const capabilities = source.capabilities ?? [];

  if (capabilities.length === 0) {
    return <p className="muted-text">这个来源还没有定义功能。</p>;
  }

  return (
    <div className="source-feature-list">
      {capabilities.map((capability, index) => {
        const fields = Object.entries(capability.fields ?? {});
        return (
          <div className="source-feature-card" key={`${capability.kind}-${index}`}>
            <div className="source-feature-card-header">
              <div>
                <span className="source-feature-kind">{capabilityLabels[capability.kind]}</span>
                <h3>{capability.kind}</h3>
              </div>
              <span className="source-feature-engine">{capability.item?.engine ?? "direct"}</span>
            </div>

            <p className="source-feature-summary">{capabilitySummary(capability)}</p>

            {fields.length > 0 ? (
              <div className="source-feature-fields">
                {fields.map(([fieldName, selector]) => (
                  <span className="source-feature-field" key={fieldName}>
                    <strong>{fieldName}</strong>
                    <span>{selector.engine}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SourceListTab({ sources }: { sources: YeaderSource[] }) {
  const [donationSource, setDonationSource] = useState<YeaderSource | null>(null);
  const sourceItems = useMemo(() => sources.map(contentSourceFromYeaderSource), [sources]);
  const enabledCount = sourceItems.filter((source) => source.enabled).length;
  const [filter, setFilter] = useState<SourceKindFilter>("all");
  const filteredSourceItems = useMemo(() => filterContentSources(sourceItems, filter), [sourceItems, filter]);
  const [selectedSourceId, setSelectedSourceId] = useState(() => sources[0]?.id ?? "");
  const pluginRegistry = useMemo(() => getBundledPluginRegistryPreview(), []);
  const pluginCount = pluginRegistryEntries(pluginRegistry).length;

  useEffect(() => {
    if (filter === "plugin") {
      return;
    }
    if (!filteredSourceItems.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(filteredSourceItems[0]?.id ?? "");
    }
  }, [filter, filteredSourceItems, selectedSourceId]);

  if (sources.length === 0 && filter !== "plugin") {
    return (
      <div className="source-ops-panel">
        <SourceKindTabs
          filter={filter}
          counts={{
            all: sourceItems.length,
            rss: filterContentSources(sourceItems, "rss").length,
            rule: filterContentSources(sourceItems, "rule-source").length,
            plugin: pluginCount,
          }}
          onChange={setFilter}
        />
        <div className="empty-state">
          <p>暂无来源，请导入规则源、RSS 或安装插件。</p>
        </div>
      </div>
    );
  }

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];
  const selectedSourceItem = contentSourceFromYeaderSource(selectedSource);
  const visibleSelectedSource = filteredSourceItems.find((source) => source.id === selectedSourceItem.id)
    ?? filteredSourceItems[0];
  const visibleRawSource = sources.find((source) => source.id === visibleSelectedSource?.id);

  return (
    <div className="source-ops-panel">
      <SourceKindTabs
        filter={filter}
        counts={{
          all: sourceItems.length,
          rss: filterContentSources(sourceItems, "rss").length,
          rule: filterContentSources(sourceItems, "rule-source").length,
          plugin: pluginCount,
        }}
        onChange={setFilter}
      />

      {filter === "plugin" ? <PluginRegistryPreview registry={pluginRegistry} /> : null}
      {filter !== "plugin" && filteredSourceItems.length === 0 ? (
        <div className="empty-state source-kind-empty">
          <p>当前分组暂无来源。</p>
        </div>
      ) : null}
      {filter !== "plugin" && filteredSourceItems.length > 0 && visibleRawSource ? (
        <>
      <div className="source-ops-panel-header">
        <div>
          <h2>规则来源</h2>
          <p className="import-desc">当前可用于搜索、列表、详情、目录和正文抓取的本地内容来源。</p>
        </div>
        <span className="source-summary-chip available">启用:{enabledCount} 全部:{sources.length}</span>
      </div>

      <div className="source-detail-layout">
        <aside className="source-picker">
          <label htmlFor="source-detail-select">选择来源</label>
          <select
            id="source-detail-select"
            className="form-input"
            value={visibleSelectedSource.id}
            onChange={(event) => setSelectedSourceId(event.target.value)}
          >
            {filteredSourceItems.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>

          <div className="source-picker-list" role="list">
            {filteredSourceItems.map((source) => (
              <button
                className={`source-picker-item ${source.id === visibleSelectedSource.id ? "active" : ""}`}
                data-source-id={source.id}
                key={source.id}
                type="button"
                onClick={() => setSelectedSourceId(source.id)}
              >
                <span>{source.name}</span>
                <small>{sourceKindLabel(source.kind)} · {source.capabilityLabels.length} 项功能</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="source-detail-panel">
          <div className="source-detail-header">
            <div>
              <h3>{visibleRawSource.name}</h3>
              <span className={`source-status ${visibleRawSource.enabled ? "enabled" : "disabled"}`}>{visibleRawSource.enabled ? "启用" : "禁用"}</span>
              <span className="source-status">{sourceKindLabel(visibleSelectedSource.kind)}</span>
            </div>
            {visibleRawSource.donateUrl ? (
              <button className="source-donate-btn donate-action-primary" type="button" onClick={() => setDonationSource(visibleRawSource)}>Donate</button>
            ) : null}
          </div>

          <div className="source-detail-meta">
            {visibleRawSource.homepage ? (
              <a href={visibleRawSource.homepage} target="_blank" rel="noreferrer">{visibleRawSource.homepage}</a>
            ) : <span className="muted-text">无主页</span>}
            {visibleRawSource.publisher ? <span>发布者:{visibleRawSource.publisher}</span> : null}
            {visibleRawSource.version ? <span>版本:{visibleRawSource.version}</span> : null}
          </div>

          <div className="source-detail-tags">
            {(visibleRawSource.tags ?? []).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>

          <div className="source-defaults">
            <span>默认请求</span>
            <strong>{visibleRawSource.requestDefaults?.encoding ?? "auto"}</strong>
            <strong>{visibleRawSource.requestDefaults?.timeoutMs ? `${visibleRawSource.requestDefaults.timeoutMs}ms` : "默认超时"}</strong>
            <strong>{Object.keys(visibleRawSource.requestDefaults?.headers ?? {}).length} 个 header</strong>
          </div>

          <div className="source-feature-section">
            <div className="source-feature-section-header">
              <h3>功能</h3>
              <span>{(visibleRawSource.capabilities ?? []).length} 项</span>
            </div>
            <SourceFeatureList source={visibleRawSource} />
          </div>
        </section>
      </div>
        </>
      ) : null}
      {donationSource ? <DonateDialog source={donationSource} onClose={() => setDonationSource(null)} /> : null}
    </div>
  );
}

export function SourceInstallPanel({ onImported }: { onImported: () => void }) {
  const [registrySources, setRegistrySources] = useState<SourceRegistryEntry[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [message, setMessage] = useState("");

  async function loadRegistry() {
    setLoadingRegistry(true);
    setMessage("");
    try {
      const response = await fetch(SOURCE_REGISTRY_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const registry = parseSourceRegistry(await response.json());
      if (!registry) {
        throw new Error("来源索引格式不正确");
      }
      setRegistrySources(registry.sources);
      setMessage(`已加载 ${registry.sources.length} 个可安装来源`);
    } catch (error) {
      setRegistrySources([]);
      setMessage(`加载来源索引失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingRegistry(false);
    }
  }

  async function importPackJson(json: string, successLabel: string) {
    const imported = await importYeaderSourcePackJson(json);
    setMessage(`${successLabel}: ${imported.length} 个来源`);
    onImported();
  }

  async function installRegistrySource(source: SourceRegistryEntry) {
    setBusySourceId(source.id);
    setMessage("");
    try {
      const response = await fetch(source.packUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await importPackJson(await response.text(), `已安装 ${source.name}`);
    } catch (error) {
      setMessage(`安装失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusySourceId(null);
    }
  }

  async function importFromUrl() {
    const url = customUrl.trim();
    if (!url) {
      setMessage("请输入 source-pack URL");
      return;
    }
    setBusySourceId("custom-url");
    setMessage("");
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await importPackJson(await response.text(), "已导入自定义 URL");
      setCustomUrl("");
    } catch (error) {
      setMessage(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusySourceId(null);
    }
  }

  async function importFromText() {
    const json = customJson.trim();
    if (!json) {
      setMessage("请粘贴 yeader.source-pack JSON");
      return;
    }
    setBusySourceId("custom-json");
    setMessage("");
    try {
      await importPackJson(json, "已导入自定义 JSON");
      setCustomJson("");
    } catch (error) {
      setMessage(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusySourceId(null);
    }
  }

  return (
    <section className="source-ops-panel source-install-panel">
      <div className="source-ops-panel-header">
        <div>
          <h2>安装来源</h2>
          <p className="import-desc">Yeader 不再内置站点规则；从公共索引下载来源，或导入任意自定义 source-pack JSON。</p>
        </div>
        <a className="source-donate-btn" href={SOURCE_REGISTRY_REPOSITORY_URL} target="_blank" rel="noreferrer">来源仓库</a>
      </div>

      <div className="source-install-actions">
        <button className="btn-secondary" type="button" disabled={loadingRegistry} onClick={() => void loadRegistry()}>
          {loadingRegistry ? "加载中..." : "加载公共来源索引"}
        </button>
        <span className="muted-text">{SOURCE_REGISTRY_URL}</span>
      </div>

      {registrySources.length > 0 ? (
        <div className="plugin-registry-preview source-registry-preview">
          {registrySources.map((source) => (
            <article className="plugin-registry-card" key={source.id}>
              <div className="plugin-registry-card-header">
                <div>
                  <h3>{source.name}</h3>
                  <p>{source.description}</p>
                </div>
                <span className="source-status enabled">{source.mediaType}</span>
              </div>
              <div className="plugin-registry-meta">
                <a href={source.homepage} target="_blank" rel="noreferrer">{source.homepage}</a>
                <span>{source.review.status}</span>
              </div>
              <div className="plugin-registry-meta">
                {source.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              <button
                className="btn-primary"
                type="button"
                disabled={busySourceId !== null}
                onClick={() => void installRegistrySource(source)}
              >
                {busySourceId === source.id ? "安装中..." : "安装来源"}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      <div className="custom-source-import">
        <div className="form-group">
          <label htmlFor="custom-source-url">自定义 source-pack URL</label>
          <div className="source-search-bar">
            <input
              id="custom-source-url"
              className="form-input source-search-input"
              type="url"
              placeholder="https://example.com/my-source-pack.json"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
            />
            <button className="btn-secondary" type="button" disabled={busySourceId !== null} onClick={() => void importFromUrl()}>
              {busySourceId === "custom-url" ? "导入中..." : "导入 URL"}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="custom-source-json">粘贴 source-pack JSON</label>
          <textarea
            id="custom-source-json"
            className="form-input custom-source-json"
            placeholder="{ &quot;format&quot;: &quot;yeader.source-pack&quot;, ... }"
            value={customJson}
            onChange={(event) => setCustomJson(event.target.value)}
          />
          <button className="btn-secondary" type="button" disabled={busySourceId !== null} onClick={() => void importFromText()}>
            {busySourceId === "custom-json" ? "导入中..." : "导入 JSON"}
          </button>
        </div>
      </div>

      {message ? <p className="explore-status">{message}</p> : null}
    </section>
  );
}

function SourceKindTabs({
  filter,
  counts,
  onChange,
}: {
  filter: SourceKindFilter;
  counts: { all: number; rss: number; rule: number; plugin: number };
  onChange: (filter: SourceKindFilter) => void;
}) {
  const tabs: Array<{ filter: SourceKindFilter; label: string; count: number }> = [
    { filter: "all", label: "全部", count: counts.all },
    { filter: "rss", label: "RSS", count: counts.rss },
    { filter: "rule-source", label: "规则", count: counts.rule },
    { filter: "plugin", label: "插件", count: counts.plugin },
  ];

  return (
    <div className="source-kind-tabs">
      {tabs.map((tab) => (
        <button
          className={`tab-btn ${filter === tab.filter ? "active" : ""}`}
          type="button"
          onClick={() => onChange(tab.filter)}
          key={tab.filter}
        >
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}

function PluginRegistryPreview({ registry }: { registry: PluginRegistryView }) {
  const entries = pluginRegistryEntries(registry);

  return (
    <div className="plugin-registry-preview">
      <div className="plugin-registry-source">
        <a href={registry.sourceUrl} target="_blank" rel="noreferrer">索引: {registry.sourceLabel}</a>
        <span>{registry.readonly ? "只读预览" : "可安装"}</span>
        <span>{registry.installAvailable ? "安装已启用" : "安装待接入"}</span>
      </div>
      {entries.map((plugin) => (
        <PluginRegistryCard plugin={plugin} key={plugin.id} />
      ))}
    </div>
  );
}

function PluginRegistryCard({ plugin }: { plugin: PluginRegistryEntry }) {
  const activation = summarizePluginActivation(plugin.activation);
  const riskLabels = pluginRiskLabels(plugin.risk);

  return (
    <article className="plugin-registry-card">
      <div className="plugin-registry-card-header">
        <div>
          <h3>{plugin.name}</h3>
          <p>{plugin.description}</p>
        </div>
        <span className={`source-status ${activation.loginRequired ? "disabled" : "enabled"}`}>
          {activation.label}
        </span>
      </div>
      <div className="plugin-registry-meta">
        <span>{plugin.runtime}</span>
        <span>{plugin.license}</span>
        <span>身份 {identityVerificationLabel(plugin.identity.verification)}</span>
        <span>{activation.loginRequired ? "需要 EVM 登录" : "无需登录"}</span>
      </div>
      <p className="plugin-registry-activation">{activation.detail}</p>
      <div className="plugin-registry-meta">
        {plugin.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
        {riskLabels.length === 0 ? <span>无高风险标签</span> : riskLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <a className="source-donate-btn" href={plugin.sourceRepo} target="_blank" rel="noreferrer">查看源码仓库</a>
    </article>
  );
}

export function PluginMarketPanel() {
  const registryPreview = getBundledPluginRegistryPreview();
  const freeActivation = summarizePluginActivation({ mode: "free" });
  const tokenActivation: PluginActivation = {
    mode: "token-transfer",
    token: {
      chain: "evm",
      chainId: 1,
      standard: "erc20",
      contract: "0xTokenContract",
      symbol: "TOKEN",
      decimals: 18,
      minAmount: "10.0",
      recipient: "0xRecipient",
      verification: "onchain-transfer",
      loginRequired: true,
    },
  };
  const tokenSummary = summarizePluginActivation(tokenActivation);

  return (
    <section className="source-ops-panel plugin-market-panel">
      <div className="source-ops-panel-header">
        <div>
          <h2>插件市场</h2>
          <p className="import-desc">复杂网站适配器来自独立插件仓库，Yeader 只负责市场、安装、权限和本地 Wasm 运行时。</p>
        </div>
        <span className="source-summary-chip available">外部索引</span>
      </div>

      <div className="plugin-market-grid">
        <div className="plugin-market-card">
          <strong>{freeActivation.label}插件</strong>
          <span>{freeActivation.detail}</span>
        </div>
        <div className="plugin-market-card">
          <strong>{tokenSummary.label}</strong>
          <span>{tokenSummary.detail}；需要 EVM 登录，并由 Yeader 校验历史 ERC-20 转账。</span>
        </div>
        <div className="plugin-market-card">
          <strong>多链捐赠</strong>
          <span>作者可声明 EVM、Tron、Bitcoin、Solana 捐赠地址；捐赠不等同身份。</span>
        </div>
      </div>

      <div className="plugin-market-meta">
        <span>身份：EVM 单地址</span>
        <span>验证：unverified / signature-pending / verified</span>
        <a href={registryPreview.sourceUrl} target="_blank" rel="noreferrer">索引：{registryPreview.sourceLabel}</a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Book Source Management (Legacy Legado format)
// ---------------------------------------------------------------------------

export function BookSourceManagementPanel({ onRefresh }: { onRefresh: () => void }) {
  const [sources, setSources] = useState<LegacyBookSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [selectedSource, setSelectedSource] = useState<LegacyBookSource | null>(null);
  const [testingKeyword, setTestingKeyword] = useState("");
  const [testResults, setTestResults] = useState<SearchResult[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  async function loadSources() {
    setLoading(true);
    setMessage("");
    try {
      setSources(await listBookSources());
    } catch (err) {
      setMessage(`加载失败: ${err instanceof Error ? err.message : String(err)}`);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  async function handleImport() {
    const json = customJson.trim();
    if (!json) {
      setMessage("请粘贴 Legado 书源 JSON");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const count = await importBookSource(json);
      setMessage(`已导入 ${count} 个书源`);
      setCustomJson("");
      void loadSources();
      onRefresh();
    } catch (err) {
      setMessage(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(url: string, enabled: boolean) {
    try {
      await toggleBookSource(url, enabled);
      void loadSources();
    } catch (err) {
      setMessage(`操作失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete(url: string) {
    try {
      await deleteBookSource(url);
      if (selectedSource?.bookSourceUrl === url) {
        setSelectedSource(null);
      }
      void loadSources();
    } catch (err) {
      setMessage(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleConvert(url: string) {
    try {
      await convertBookSource(url);
      setMessage("已转换为 Yeader 格式");
      void loadSources();
      onRefresh();
    } catch (err) {
      setMessage(`转换失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleTest() {
    if (!selectedSource || !testingKeyword.trim()) {
      setMessage("请选择一个书源并输入搜索关键字");
      return;
    }
    setTestLoading(true);
    setTestResults([]);
    try {
      const results = await searchBooks(selectedSource.bookSourceUrl, testingKeyword);
      setTestResults(results);
    } catch (err) {
      setMessage(`测试失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestLoading(false);
    }
  }

  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <section className="source-ops-panel book-source-panel">
      <div className="source-ops-panel-header">
        <div>
          <h2>书源管理</h2>
          <p className="import-desc">导入和管理 Legado 格式的书源（搜索规则、详情规则、目录规则、正文规则）。</p>
        </div>
        <span className="source-summary-chip available">启用:{enabledCount} 全部:{sources.length}</span>
      </div>

      <div className="book-source-layout">
        <aside className="book-source-list">
          <div className="book-source-list-header">
            <span>书源列表</span>
            <button
              className="btn-secondary"
              type="button"
              disabled={loading}
              onClick={() => void loadSources()}
            >
              刷新
            </button>
          </div>

          {loading && sources.length === 0 ? (
            <div className="loading">加载中...</div>
          ) : sources.length === 0 ? (
            <div className="empty-state">
              <p>暂无书源，请导入 Legado 书源 JSON。</p>
            </div>
          ) : (
            <ul className="book-source-items">
              {sources.map((source) => (
                <li key={source.bookSourceUrl}>
                  <button
                    className={`book-source-item ${selectedSource?.bookSourceUrl === source.bookSourceUrl ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedSource(source);
                      setTestResults([]);
                      setTestingKeyword("");
                    }}
                  >
                    <span className="book-source-name">{source.bookSourceName}</span>
                    <span className={`book-source-status ${source.enabled ? "enabled" : "disabled"}`}>
                      {source.enabled ? "启用" : "禁用"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="book-source-detail">
          {!selectedSource ? (
            <div className="empty-state">
              <p>选择一个书源查看详情</p>
            </div>
          ) : (
            <>
              <div className="book-source-detail-header">
                <h3>{selectedSource.bookSourceName}</h3>
                <div className="book-source-detail-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => void handleToggle(selectedSource.bookSourceUrl, !selectedSource.enabled)}
                  >
                    {selectedSource.enabled ? "禁用" : "启用"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => void handleConvert(selectedSource.bookSourceUrl)}
                  >
                    转换为 Yeader 格式
                  </button>
                  <button
                    className="btn-danger"
                    type="button"
                    onClick={() => void handleDelete(selectedSource.bookSourceUrl)}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="book-source-meta">
                <span className="book-source-url" title={selectedSource.bookSourceUrl}>
                  {selectedSource.bookSourceUrl}
                </span>
                {selectedSource.bookSourceGroup ? (
                  <span className="tag">{selectedSource.bookSourceGroup}</span>
                ) : null}
                {selectedSource.bookSourceType !== undefined && selectedSource.bookSourceType !== null ? (
                  <span className="tag">类型:{selectedSource.bookSourceType}</span>
                ) : null}
              </div>

              {selectedSource.searchUrl ? (
                <div className="book-source-rule-section">
                  <h4>搜索 URL</h4>
                  <code className="book-source-code">{selectedSource.searchUrl}</code>
                </div>
              ) : null}

              {selectedSource.ruleSearch ? (
                <div className="book-source-rule-section">
                  <h4>搜索规则</h4>
                  <div className="book-source-rules">
                    {Object.entries(selectedSource.ruleSearch).map(([key, value]) =>
                      value ? (
                        <div className="book-source-rule-item" key={key}>
                          <strong>{key}</strong>
                          <code>{value}</code>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}

              {selectedSource.ruleBookInfo ? (
                <div className="book-source-rule-section">
                  <h4>详情规则</h4>
                  <div className="book-source-rules">
                    {Object.entries(selectedSource.ruleBookInfo).map(([key, value]) =>
                      value ? (
                        <div className="book-source-rule-item" key={key}>
                          <strong>{key}</strong>
                          <code>{value}</code>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}

              {selectedSource.ruleToc ? (
                <div className="book-source-rule-section">
                  <h4>目录规则</h4>
                  <div className="book-source-rules">
                    {Object.entries(selectedSource.ruleToc).map(([key, value]) =>
                      value ? (
                        <div className="book-source-rule-item" key={key}>
                          <strong>{key}</strong>
                          <code>{value}</code>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}

              {selectedSource.ruleContent ? (
                <div className="book-source-rule-section">
                  <h4>正文规则</h4>
                  <div className="book-source-rules">
                    {Object.entries(selectedSource.ruleContent).map(([key, value]) =>
                      value ? (
                        <div className="book-source-rule-item" key={key}>
                          <strong>{key}</strong>
                          <code>{value}</code>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              ) : null}

              <div className="book-source-test-section">
                <h4>测试书源</h4>
                <div className="book-source-test-form">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="输入搜索关键字"
                    value={testingKeyword}
                    onChange={(e) => setTestingKeyword(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={testLoading}
                    onClick={() => void handleTest()}
                  >
                    {testLoading ? "测试中..." : "搜索测试"}
                  </button>
                </div>

                {testResults.length > 0 ? (
                  <div className="book-source-test-results">
                    <p>找到 {testResults.length} 个结果</p>
                    <ul className="book-source-test-results-list">
                      {testResults.slice(0, 10).map((result, idx) => (
                        <li key={idx} className="book-source-test-result-item">
                          <span className="book-source-test-result-title">{result.name}</span>
                          {result.author ? <span className="book-source-test-result-author">{result.author}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {testResults.length > 10 ? (
                      <p className="muted-text">还有 {testResults.length - 10} 个结果...</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="book-source-import-section">
        <h4>导入书源</h4>
        <textarea
          className="form-input custom-source-json"
          placeholder='[{"bookSourceUrl": "https://...", "bookSourceName": "书源名称", ...}]'
          value={customJson}
          onChange={(e) => setCustomJson(e.target.value)}
        />
        <button className="btn-secondary" type="button" disabled={loading} onClick={() => void handleImport()}>
          {loading ? "导入中..." : "导入 JSON"}
        </button>
      </div>

      {message ? <p className="explore-status">{message}</p> : null}
    </section>
  );
}
