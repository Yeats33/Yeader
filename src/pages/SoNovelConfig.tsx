import { useEffect, useMemo, useState } from "react";
import { getSoNovelConfig, resetSoNovelConfig, saveSoNovelConfig } from "../api.ts";
import { navigate } from "../routing/hashRoute.ts";
import {
  CONFIG_FIELDS,
  dumpIni,
  getFieldValue,
  parseIni,
  updateConfigValue,
  type ParsedConfig,
  type ParsedIni,
} from "./soNovelConfigModel.ts";

type ConfigMode = "smart" | "text";
type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "resetting";

const CONFIG_SECTIONS = [...new Set(CONFIG_FIELDS.map((field) => field.section))];

function ArrowLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ConfigFieldControl({ config, section, fieldKey, onChange }: {
  config: ParsedConfig;
  section: string;
  fieldKey: string;
  onChange: (section: string, key: string, value: string) => void;
}) {
  const field = CONFIG_FIELDS.find((item) => item.section === section && item.key === fieldKey);
  if (!field) return null;

  const value = getFieldValue(config, field);
  const id = `config-${field.section}-${field.key}`;

  return (
    <div className="form-group">
      <label htmlFor={id}>{field.label}</label>
      {field.type === "select" ? (
        <select
          className="form-input"
          id={id}
          value={value}
          onChange={(event) => onChange(field.section, field.key, event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option || "(空)"}</option>
          ))}
        </select>
      ) : (
        <input
          className="form-input"
          id={id}
          type={field.type}
          value={value}
          onChange={(event) => onChange(field.section, field.key, event.target.value)}
        />
      )}
      {field.desc ? <span className="field-desc">{field.desc}</span> : null}
    </div>
  );
}

function SmartEditor({ config, onChange }: {
  config: ParsedConfig;
  onChange: (section: string, key: string, value: string) => void;
}) {
  return (
    <div className="config-form-grid" id="config-form-grid">
      {CONFIG_SECTIONS.map((section) => (
        <div className="config-section" key={section}>
          <h3 className="config-section-title">{section}</h3>
          <div className="config-fields">
            {CONFIG_FIELDS.filter((field) => field.section === section).map((field) => (
              <ConfigFieldControl
                key={`${field.section}.${field.key}`}
                config={config}
                section={field.section}
                fieldKey={field.key}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SoNovelConfigPage() {
  const [mode, setMode] = useState<ConfigMode>("smart");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [parsed, setParsed] = useState<ParsedIni | null>(null);
  const [rawText, setRawText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadConfig(): Promise<void> {
    setLoadState("loading");
    setMessage(null);
    try {
      const content = await getSoNovelConfig();
      setRawText(content);
      setParsed(parseIni(content));
      setLoadState("ready");
    } catch (error) {
      setMessage(`加载失败: ${errorMessage(error)}`);
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  const config = useMemo(() => parsed?.config ?? {}, [parsed]);
  const busy = saveState !== "idle";

  function updateField(section: string, key: string, value: string): void {
    setParsed((current) => current ? {
      ...current,
      config: updateConfigValue(current.config, section, key, value),
    } : current);
  }

  async function saveSmartConfig(): Promise<void> {
    if (!parsed) return;
    setSaveState("saving");
    setMessage(null);
    try {
      await saveSoNovelConfig(dumpIni(parsed));
      navigate("/integration");
    } catch (error) {
      setMessage(`保存失败: ${errorMessage(error)}`);
    } finally {
      setSaveState("idle");
    }
  }

  async function saveTextConfig(): Promise<void> {
    setSaveState("saving");
    setMessage(null);
    try {
      await saveSoNovelConfig(rawText);
      navigate("/integration");
    } catch (error) {
      setMessage(`保存失败: ${errorMessage(error)}`);
    } finally {
      setSaveState("idle");
    }
  }

  async function resetConfig(): Promise<void> {
    if (!window.confirm("确定恢复默认配置？当前修改将被丢弃。")) return;
    setSaveState("resetting");
    setMessage(null);
    try {
      await resetSoNovelConfig();
      await loadConfig();
      setMessage("已恢复默认配置");
    } catch (error) {
      setMessage(`恢复失败: ${errorMessage(error)}`);
    } finally {
      setSaveState("idle");
    }
  }

  return (
    <div className="page page-integration">
      <header className="page-header">
        <h1>so-novel 配置（废弃）</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/integration")} title="返回">
          <ArrowLeftIcon />
        </button>
      </header>

      <div className="config-message">
        so-novel 仅作为旧兼容入口保留；新的站点接入请使用 YeaderHub 插件或本地规则源。
      </div>

      <div className="config-mode-tabs">
        <button className={`tab-btn ${mode === "smart" ? "active" : ""}`} type="button" onClick={() => setMode("smart")}>
          傻瓜模式
        </button>
        <button className={`tab-btn ${mode === "text" ? "active" : ""}`} type="button" onClick={() => setMode("text")}>
          文本编辑
        </button>
      </div>

      {message ? <div className="config-message">{message}</div> : null}

      {loadState === "loading" ? (
        <div className="settings-section">
          <div className="empty-state">加载中...</div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="settings-section">
          <div className="empty-state">
            <button className="btn-secondary" type="button" onClick={() => void loadConfig()}>
              重试
            </button>
          </div>
        </div>
      ) : null}

      {loadState === "ready" && mode === "smart" ? (
        <div className="config-smart-editor">
          <SmartEditor config={config} onChange={updateField} />
          <div className="config-form-actions">
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveSmartConfig()}>
              {saveState === "saving" ? "保存中..." : "保存配置"}
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => void resetConfig()}>
              {saveState === "resetting" ? "恢复中..." : "恢复默认"}
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => navigate("/integration/so-novel/rules")}>
              规则管理
            </button>
          </div>
        </div>
      ) : null}

      {loadState === "ready" && mode === "text" ? (
        <div className="config-text-editor">
          <div className="config-textarea-wrapper">
            <textarea
              id="config-editor"
              className="config-textarea"
              spellCheck={false}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
            />
          </div>
          <div className="config-text-actions">
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveTextConfig()}>
              {saveState === "saving" ? "保存中..." : "保存文本"}
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => void resetConfig()}>
              {saveState === "resetting" ? "恢复中..." : "恢复默认"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
