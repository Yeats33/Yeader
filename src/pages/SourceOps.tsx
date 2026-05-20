import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { navigate } from "../router.ts";
import { listYeaderSources } from "../api.ts";
import type { YeaderCapability, YeaderSource } from "../types.ts";
import { ExploreTab } from "./ExplorePage.tsx";
import { SourceSearchTab } from "./SourceSearch.tsx";

type SourceOpsTab = "import" | "sources" | "explore" | "search";

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

function ImportTab({ sources }: { sources: YeaderSource[] }) {
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
      setError("请选择书源");
      return;
    }

    navigate(`/online-reader/${encodeURIComponent(trimmedUrl)}/${encodeURIComponent(source.id)}`);
  }

  if (enabledSources.length === 0) {
    return (
      <div className="source-ops-panel">
        <div className="empty-state">
          <p>暂无启用的书源，请先在设置中添加书源。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="source-ops-panel import-form">
        <div className="source-ops-panel-header">
          <div>
            <h2>通过链接打开书籍</h2>
            <p className="import-desc">粘贴小说页面链接，自动匹配可用书源并进入在线阅读。</p>
          </div>
          <span className="source-summary-chip available">启用:{enabledSources.length} 全部:{sources.length}</span>
        </div>

        <div className="source-ops-form-grid">
          <div className="form-group">
            <label htmlFor="import-source">选择书源</label>
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

          <button className="btn-primary source-ops-submit" type="button" onClick={openOnlineReader}>打开</button>
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
    return <p className="muted-text">这个书源还没有定义功能。</p>;
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

function SourceListTab({ sources }: { sources: YeaderSource[] }) {
  const [donationSource, setDonationSource] = useState<YeaderSource | null>(null);
  const enabledCount = sources.filter((source) => source.enabled).length;
  const [selectedSourceId, setSelectedSourceId] = useState(() => sources[0]?.id ?? "");

  useEffect(() => {
    if (!sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(sources[0]?.id ?? "");
    }
  }, [selectedSourceId, sources]);

  if (sources.length === 0) {
    return (
      <div className="source-ops-panel">
        <div className="empty-state">
          <p>暂无书源，请导入书源配置。</p>
        </div>
      </div>
    );
  }

  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];

  return (
    <div className="source-ops-panel">
      <div className="source-ops-panel-header">
        <div>
          <h2>Yeader 书源</h2>
          <p className="import-desc">当前可用于在线搜索、详情、目录和正文抓取的书源。</p>
        </div>
        <span className="source-summary-chip available">启用:{enabledCount} 全部:{sources.length}</span>
      </div>

      <div className="source-detail-layout">
        <aside className="source-picker">
          <label htmlFor="source-detail-select">选择书源</label>
          <select
            id="source-detail-select"
            className="form-input"
            value={selectedSource.id}
            onChange={(event) => setSelectedSourceId(event.target.value)}
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>

          <div className="source-picker-list" role="list">
            {sources.map((source) => (
              <button
                className={`source-picker-item ${source.id === selectedSource.id ? "active" : ""}`}
                data-source-id={source.id}
                key={source.id}
                type="button"
                onClick={() => setSelectedSourceId(source.id)}
              >
                <span>{source.name}</span>
                <small>{(source.capabilities ?? []).length} 项功能</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="source-detail-panel">
          <div className="source-detail-header">
            <div>
              <h3>{selectedSource.name}</h3>
              <span className={`source-status ${selectedSource.enabled ? "enabled" : "disabled"}`}>{selectedSource.enabled ? "启用" : "禁用"}</span>
            </div>
            {selectedSource.donateUrl ? (
              <button className="source-donate-btn donate-action-primary" type="button" onClick={() => setDonationSource(selectedSource)}>Donate</button>
            ) : null}
          </div>

          <div className="source-detail-meta">
            {selectedSource.homepage ? (
              <a href={selectedSource.homepage} target="_blank" rel="noreferrer">{selectedSource.homepage}</a>
            ) : <span className="muted-text">无主页</span>}
            {selectedSource.publisher ? <span>发布者:{selectedSource.publisher}</span> : null}
            {selectedSource.version ? <span>版本:{selectedSource.version}</span> : null}
          </div>

          <div className="source-detail-tags">
            {(selectedSource.tags ?? []).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
          </div>

          <div className="source-defaults">
            <span>默认请求</span>
            <strong>{selectedSource.requestDefaults?.encoding ?? "auto"}</strong>
            <strong>{selectedSource.requestDefaults?.timeoutMs ? `${selectedSource.requestDefaults.timeoutMs}ms` : "默认超时"}</strong>
            <strong>{Object.keys(selectedSource.requestDefaults?.headers ?? {}).length} 个 header</strong>
          </div>

          <div className="source-feature-section">
            <div className="source-feature-section-header">
              <h3>功能</h3>
              <span>{(selectedSource.capabilities ?? []).length} 项</span>
            </div>
            <SourceFeatureList source={selectedSource} />
          </div>
        </section>
      </div>
      {donationSource ? <DonateDialog source={donationSource} onClose={() => setDonationSource(null)} /> : null}
    </div>
  );
}

export function SourceOpsPage() {
  const [tab, setTab] = useState<SourceOpsTab>("explore");
  const [sources, setSources] = useState<YeaderSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listYeaderSources()
      .then((loadedSources) => {
        if (!cancelled) {
          setSources(loadedSources);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSources([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page page-source-ops">
      <header className="page-header">
        <button className="btn-icon" type="button" onClick={() => navigate("/")} title="返回书架">
          &#x2190;
        </button>
        <h1>书源管理</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/settings")} title="设置">
          &#x2699;
        </button>
      </header>

      <div className="source-ops-shell">
        <div className="source-ops-tabs">
          <button className={`tab-btn ${tab === "explore" ? "active" : ""}`} type="button" onClick={() => setTab("explore")}>发现</button>
          <button className={`tab-btn ${tab === "search" ? "active" : ""}`} type="button" onClick={() => setTab("search")}>搜索</button>
          <button className={`tab-btn ${tab === "import" ? "active" : ""}`} type="button" onClick={() => setTab("import")}>链接导入</button>
          <button className={`tab-btn ${tab === "sources" ? "active" : ""}`} type="button" onClick={() => setTab("sources")}>书源列表</button>
        </div>

        <div className="source-ops-content">
          {loading ? <div className="loading">加载中...</div> : null}
          {!loading && tab === "explore" ? <ExploreTab sources={sources} /> : null}
          {!loading && tab === "search" ? <SourceSearchTab sources={sources} /> : null}
          {!loading && tab === "import" ? <ImportTab sources={sources} /> : null}
          {!loading && tab === "sources" ? <SourceListTab sources={sources} /> : null}
        </div>
      </div>
    </div>
  );
}
