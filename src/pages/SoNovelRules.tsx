import { useEffect, useMemo, useState } from "react";
import {
  deleteSoNovelRule,
  getSoNovelActiveRule,
  importSoNovelRule,
  listSoNovelRules,
  setSoNovelActiveRule,
} from "../api.ts";
import { navigate } from "../routing/hashRoute.ts";
import {
  OFFICIAL_RULES,
  activeRuleFileName,
  customOnlyRules,
  isOfficialActive,
  isOfficialInstalled,
  validateRuleImport,
  type OfficialRule,
  type RuleAction,
} from "./soNovelRulesModel.ts";

type LoadState = "loading" | "ready" | "error";
type BusyAction = {
  action: RuleAction;
  name: string;
} | null;

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

async function fetchRuleContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

function ActiveRuleDisplay({ activeRule }: { activeRule: string }) {
  return (
    <section className="settings-section">
      <div className="section-header">
        <h2>当前激活</h2>
      </div>
      <div className="active-rule-display">
        <span className="active-rule-name">{activeRule || "未设置"}</span>
      </div>
    </section>
  );
}

function RuleItem({ name, activeRule, busy, onActivate, onDelete }: {
  name: string;
  activeRule: string;
  busy: BusyAction;
  onActivate: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const isActive = activeRule === activeRuleFileName(name);
  const isBusy = busy?.name === name;

  return (
    <div className="rule-item">
      <div className="rule-item-info">
        <strong className="rule-item-name">{activeRuleFileName(name)}</strong>
        {isActive ? <span className="rule-active-badge">已激活</span> : null}
      </div>
      <div className="rule-item-actions">
        {!isActive ? (
          <button className="btn-secondary btn-sm" type="button" disabled={isBusy} onClick={() => onActivate(name)}>
            {busy?.action === "activate-custom" && isBusy ? "激活中..." : "激活"}
          </button>
        ) : null}
        <button className="btn-danger btn-sm" type="button" disabled={isBusy} onClick={() => onDelete(name)}>
          {busy?.action === "delete-custom" && isBusy ? "删除中..." : "删除"}
        </button>
      </div>
    </div>
  );
}

function OfficialRuleItem({ rule, rules, activeRule, busy, onDownload, onUpdate, onActivate }: {
  rule: OfficialRule;
  rules: string[];
  activeRule: string;
  busy: BusyAction;
  onDownload: (rule: OfficialRule) => void;
  onUpdate: (rule: OfficialRule) => void;
  onActivate: (rule: OfficialRule) => void;
}) {
  const installed = isOfficialInstalled(rule.label, rules);
  const active = isOfficialActive(rule.label, activeRule);
  const isBusy = busy?.name === rule.name;

  return (
    <div className="rule-item">
      <div className="rule-item-info">
        <strong className="rule-item-name">{rule.label}</strong>
        <span className="rule-item-desc">{rule.desc}</span>
      </div>
      <div className="rule-item-actions">
        {!installed ? (
          <button className="btn-secondary btn-sm" type="button" disabled={isBusy} onClick={() => onDownload(rule)}>
            {busy?.action === "download-official" && isBusy ? "下载中..." : "下载"}
          </button>
        ) : active ? (
          <span className="rule-active-badge">已激活</span>
        ) : (
          <>
            <button className="btn-secondary btn-sm" type="button" disabled={isBusy} onClick={() => onUpdate(rule)}>
              {busy?.action === "update-official" && isBusy ? "更新中..." : "更新"}
            </button>
            <button className="btn-secondary btn-sm" type="button" disabled={isBusy} onClick={() => onActivate(rule)}>
              {busy?.action === "activate-official" && isBusy ? "激活中..." : "激活"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ImportRuleModal({ busy, onClose, onImport }: {
  busy: boolean;
  onClose: () => void;
  onImport: (name: string, content: string) => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(): void {
    const validation = validateRuleImport(name, content);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    onImport(name.trim(), content.trim());
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal">
        <div className="modal-header">
          <h3>导入自定义规则</h3>
          <button className="btn-icon" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error ? <div className="config-message">{error}</div> : null}
          <div className="form-group">
            <label htmlFor="import-rule-name">规则名称</label>
            <input
              className="form-input"
              id="import-rule-name"
              placeholder="例如 my-rule"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="import-rule-content">JSON 内容</label>
            <textarea
              className="form-textarea"
              id="import-rule-content"
              placeholder="粘贴 JSON 内容..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="btn-primary" type="button" disabled={busy} onClick={submit}>
            {busy ? "导入中..." : "导入"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SoNovelRulesPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [rules, setRules] = useState<string[]>([]);
  const [activeRule, setActiveRule] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const customRules = useMemo(() => customOnlyRules(rules), [rules]);

  async function loadRules(): Promise<void> {
    setLoadState("loading");
    setMessage(null);
    try {
      const [nextRules, nextActiveRule] = await Promise.all([
        listSoNovelRules(),
        getSoNovelActiveRule(),
      ]);
      setRules(nextRules);
      setActiveRule(nextActiveRule);
      setLoadState("ready");
    } catch (error) {
      setMessage(`加载失败: ${errorMessage(error)}`);
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  async function runOfficialDownload(rule: OfficialRule): Promise<void> {
    setBusy({ action: "download-official", name: rule.name });
    setMessage(null);
    try {
      const content = await fetchRuleContent(rule.url);
      await importSoNovelRule(rule.name, content);
      await setSoNovelActiveRule(rule.label);
      await loadRules();
    } catch (error) {
      setMessage(`下载失败: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runOfficialUpdate(rule: OfficialRule): Promise<void> {
    setBusy({ action: "update-official", name: rule.name });
    setMessage(null);
    try {
      const content = await fetchRuleContent(rule.url);
      await importSoNovelRule(rule.name, content);
      await loadRules();
    } catch (error) {
      setMessage(`更新失败: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runActivate(name: string, label: string, action: RuleAction): Promise<void> {
    setBusy({ action, name });
    setMessage(null);
    try {
      await setSoNovelActiveRule(label);
      await loadRules();
    } catch (error) {
      setMessage(`激活失败: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteCustom(name: string): Promise<void> {
    if (!window.confirm(`确定删除规则 ${activeRuleFileName(name)}？`)) return;
    setBusy({ action: "delete-custom", name });
    setMessage(null);
    try {
      await deleteSoNovelRule(name);
      await loadRules();
    } catch (error) {
      setMessage(`删除失败: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runImportCustom(name: string, content: string): Promise<void> {
    setBusy({ action: "import-custom", name });
    setMessage(null);
    try {
      await importSoNovelRule(name, content);
      await setSoNovelActiveRule(activeRuleFileName(name));
      setShowImport(false);
      await loadRules();
    } catch (error) {
      setMessage(`导入失败: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page page-integration">
      <header className="page-header">
        <h1>规则管理</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/integration")} title="返回">
          <ArrowLeftIcon />
        </button>
      </header>

      {message ? <div className="config-message">{message}</div> : null}

      {loadState === "loading" ? (
        <section className="settings-section">
          <div className="empty-state">加载中...</div>
        </section>
      ) : null}

      {loadState === "error" ? (
        <section className="settings-section">
          <div className="empty-state">
            <button className="btn-secondary" type="button" onClick={() => void loadRules()}>
              重试
            </button>
          </div>
        </section>
      ) : null}

      {loadState === "ready" ? (
        <>
          <ActiveRuleDisplay activeRule={activeRule} />

          <section className="settings-section">
            <div className="section-header">
              <h2>自定义规则</h2>
              <div className="section-actions">
                <button className="btn-secondary" type="button" disabled={busy !== null} onClick={() => setShowImport(true)}>
                  导入规则
                </button>
              </div>
            </div>
            <div className="rules-list">
              {customRules.length === 0 ? (
                <div className="empty-state">暂无自定义规则</div>
              ) : customRules.map((name) => (
                <RuleItem
                  key={name}
                  name={name}
                  activeRule={activeRule}
                  busy={busy}
                  onActivate={(ruleName) => void runActivate(ruleName, activeRuleFileName(ruleName), "activate-custom")}
                  onDelete={(ruleName) => void runDeleteCustom(ruleName)}
                />
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="section-header">
              <h2>官方规则</h2>
            </div>
            <div className="rules-list">
              {OFFICIAL_RULES.map((rule) => (
                <OfficialRuleItem
                  key={rule.name}
                  rule={rule}
                  rules={rules}
                  activeRule={activeRule}
                  busy={busy}
                  onDownload={(nextRule) => void runOfficialDownload(nextRule)}
                  onUpdate={(nextRule) => void runOfficialUpdate(nextRule)}
                  onActivate={(nextRule) => void runActivate(nextRule.name, nextRule.label, "activate-official")}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {showImport ? (
        <ImportRuleModal
          busy={busy?.action === "import-custom"}
          onClose={() => setShowImport(false)}
          onImport={(name, content) => void runImportCustom(name, content)}
        />
      ) : null}
    </div>
  );
}
