import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { navigate } from "../router.ts";
import { listYeaderSources } from "../api.ts";
import type { YeaderSource } from "../types.ts";

type SourceOpsTab = "import" | "sources";

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

function DonateDialog({ source, onClose }: { source: YeaderSource; onClose: () => void }) {
  const donateUrl = source.donateUrl ?? "";
  const donateAddress = donateAddressFromUrl(donateUrl);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(donateUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 184,
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
            <p>{source.publisher ?? source.name}</p>
          </div>
          <button className="btn-icon" type="button" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="donate-qr-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt="Donate QR code" /> : <span className="muted-text">二维码生成失败</span>}
        </div>

        <code className="donate-address">{donateAddress}</code>

        <div className="donate-actions">
          <button className="source-donate-btn" type="button" onClick={copyAddress}>{copied ? "已复制" : "复制地址"}</button>
          <a className="source-donate-btn" href={donateUrl} target="_blank" rel="noreferrer">打开钱包链接</a>
        </div>
      </div>
    </div>
  );
}

function SourceListTab({ sources }: { sources: YeaderSource[] }) {
  const [donationSource, setDonationSource] = useState<YeaderSource | null>(null);

  if (sources.length === 0) {
    return (
      <div className="source-ops-panel">
        <div className="empty-state">
          <p>暂无书源，请导入书源配置。</p>
        </div>
      </div>
    );
  }

  const enabledCount = sources.filter((source) => source.enabled).length;

  return (
    <div className="source-ops-panel">
      <div className="source-ops-panel-header">
        <div>
          <h2>Yeader 书源</h2>
          <p className="import-desc">当前可用于在线搜索、详情、目录和正文抓取的书源。</p>
        </div>
        <span className="source-summary-chip available">启用:{enabledCount} 全部:{sources.length}</span>
      </div>
      <div className="source-list">
        {sources.map((source) => (
          <div className="source-card" data-source-id={source.id} key={source.id}>
            <div className="source-card-header">
              <h3>{source.name}</h3>
              <span className={`source-status ${source.enabled ? "enabled" : "disabled"}`}>{source.enabled ? "启用" : "禁用"}</span>
            </div>
            <div className="source-card-meta">
              {source.homepage ? <a href={source.homepage} target="_blank" rel="noreferrer">{source.homepage}</a> : null}
            </div>
            {(source.publisher || source.donateUrl) ? (
              <div className="source-card-publisher">
                {source.publisher ? <span>发布者:{source.publisher}</span> : null}
                {source.donateUrl ? (
                  <button className="source-donate-btn" type="button" onClick={() => setDonationSource(source)}>Donate</button>
                ) : null}
              </div>
            ) : null}
            <div className="source-card-caps">
              {source.capabilities && source.capabilities.length > 0
                ? source.capabilities.map((capability, index) => <span className="cap-tag" key={`${capability.kind}-${index}`}>{capability.kind}</span>)
                : <span className="muted-text">无能力定义</span>}
            </div>
            <div className="source-card-tags">
              {(source.tags ?? []).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>
        ))}
      </div>
      {donationSource ? <DonateDialog source={donationSource} onClose={() => setDonationSource(null)} /> : null}
    </div>
  );
}

export function SourceOpsPage() {
  const [tab, setTab] = useState<SourceOpsTab>("import");
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
          <button className={`tab-btn ${tab === "import" ? "active" : ""}`} type="button" onClick={() => setTab("import")}>链接导入</button>
          <button className={`tab-btn ${tab === "sources" ? "active" : ""}`} type="button" onClick={() => setTab("sources")}>书源列表</button>
        </div>

        <div className="source-ops-content">
          {loading ? <div className="loading">加载中...</div> : null}
          {!loading && tab === "import" ? <ImportTab sources={sources} /> : null}
          {!loading && tab === "sources" ? <SourceListTab sources={sources} /> : null}
        </div>
      </div>
    </div>
  );
}
