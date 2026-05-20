import { useEffect, useState } from "react";
import { navigate } from "../router.ts";
import {
  getCurrentTheme,
  setCurrentTheme,
  getColorMode,
  getColorModePreference,
  setColorMode,
  getCustomCss,
  setCustomCss,
  describeThemeOptions,
  type ColorModePreference,
  type ThemeName,
} from "../theme.ts";
import { getDevModeStatus, toggleDevMode, getLogLines, openLogFile } from "../api.ts";

function ArrowLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <div className="section-header">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ThemeButton({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`theme-switcher-btn ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const COLOR_MODE_OPTIONS: Array<{ mode: ColorModePreference; label: string }> = [
  { mode: "system", label: "跟随系统" },
  { mode: "light", label: "浅色" },
  { mode: "dark", label: "深色" },
];

function AppearanceSettings() {
  const [result, setResult] = useState<string>("");
  const [cssExpanded, setCssExpanded] = useState(false);
  const [cssValue, setCssValue] = useState(() => getCustomCss());
  const currentTheme = getCurrentTheme();
  const currentColorModePreference = getColorModePreference();
  const currentColorMode = getColorMode();
  const themeOptions = describeThemeOptions();

  function showResult(text: string) {
    setResult(text);
    window.setTimeout(() => setResult(""), 3000);
  }

  return (
    <SettingsSection title="外观">
      <div className="appearance-settings">
        <div className="setting-row">
          <span className="setting-label">主题</span>
          <div className="theme-buttons">
            {themeOptions.map(({ name, label }) => (
              <ThemeButton
                key={name}
                label={label}
                active={currentTheme === name}
                onClick={() => {
                  setCurrentTheme(name as ThemeName);
                  showResult(`已切换到 ${label} 主题`);
                }}
              />
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-label">显示模式</span>
          <div className="theme-buttons">
            {COLOR_MODE_OPTIONS.map(({ mode, label }) => (
              <ThemeButton
                key={mode}
                label={label}
                active={currentColorModePreference === mode}
                onClick={() => {
                  setColorMode(mode);
                  const suffix = mode === "system" ? `，当前为${getColorMode() === "dark" ? "深色" : "浅色"}` : "";
                  showResult(`已切换到${label}模式${suffix}`);
                }}
              />
            ))}
          </div>
          <span className="setting-hint">当前生效：{currentColorMode === "dark" ? "深色" : "浅色"}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">自定义 CSS</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (cssExpanded) {
                setCssExpanded(false);
              } else {
                setCssValue(getCustomCss());
                setCssExpanded(true);
              }
            }}
          >
            {cssExpanded ? "收起" : "编辑"}
          </button>
        </div>
        {cssExpanded && (
          <div className="custom-css-editor">
            <textarea
              className="custom-css-input"
              value={cssValue}
              onChange={(e) => setCssValue(e.target.value)}
              placeholder="输入自定义 CSS..."
            />
            <div className="custom-css-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCustomCss(cssValue);
                  setCssExpanded(false);
                  showResult("自定义 CSS 已保存");
                }}
              >
                保存
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCssExpanded(false)}
              >
                取消
              </button>
            </div>
          </div>
        )}
        {result ? <div className="import-result"><span className="success-msg">{result}</span></div> : null}
      </div>
    </SettingsSection>
  );
}

function DevModeSettings() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ level: string; timestamp: string; target: string; message: string }>>([]);
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    getDevModeStatus()
      .then((status) => {
        setAvailable(status.available);
        setEnabled(status.enabled);
      })
      .catch(() => {});
  }, []);

  function showResult(text: string) {
    setResult(text);
    window.setTimeout(() => setResult(""), 3000);
  }

  async function toggle() {
    showResult("切换中...");
    try {
      const newState = await toggleDevMode(!enabled);
      setEnabled(newState);
      showResult(`开发模式${newState ? "已启用" : "已禁用"}`);
    } catch (e) {
      showResult(`切换失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function loadLogs() {
    showResult("加载日志中...");
    try {
      const lines = await getLogLines(200);
      setLogs(lines);
      setLogsOpen(true);
      showResult(`显示最近 ${lines.length} 条日志`);
    } catch (e) {
      showResult(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function openLog() {
    showResult("打开日志文件中...");
    try {
      await openLogFile();
      showResult("日志文件已用系统默认应用打开");
    } catch (e) {
      showResult(`打开失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!available) return null;

  return (
    <SettingsSection title="开发模式">
      <div className="dev-mode-panel">
        <div className="setting-row">
          <span className="setting-label">启用开发模式</span>
          <button
            type="button"
            className={`btn-toggle ${enabled ? "active" : ""}`}
            onClick={() => void toggle()}
          >
            {enabled ? "已启用" : "已禁用"}
          </button>
        </div>
        <div className="setting-row">
          <button type="button" className="btn-secondary" onClick={() => void loadLogs()}>
            {logsOpen ? "收起日志" : "查看日志"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void openLog()}>
            打开日志文件
          </button>
        </div>
        {logsOpen && (
          <div className="log-viewer">
            {logs.length === 0 ? (
              <p className="empty-state">暂无日志</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={`log-line log-${line.level.toLowerCase()}`}>
                  <span className="log-ts">{line.timestamp}</span>
                  <span className="log-level">[{line.level}]</span>
                  <span className="log-module">{line.target}</span>
                  <span className="log-msg">{line.message}</span>
                </div>
              ))
            )}
          </div>
        )}
        {result ? <div className="import-result"><span className="success-msg">{result}</span></div> : null}
      </div>
    </SettingsSection>
  );
}

export function SettingsPage() {
  return (
    <div className="page page-settings">
      <header className="page-header">
        <button className="btn-icon" type="button" onClick={() => navigate("/feed")} title="返回订阅">
          <ArrowLeftIcon />
        </button>
        <h1>设置</h1>
      </header>

      <AppearanceSettings />
      <DevModeSettings />
    </div>
  );
}
