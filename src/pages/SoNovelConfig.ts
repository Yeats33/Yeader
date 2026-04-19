import { navigate } from "../router.ts";
import { getSoNovelConfig, saveSoNovelConfig, resetSoNovelConfig } from "../api.ts";

type ConfigField = {
  section: string;
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  desc?: string;
};

const CONFIG_FIELDS: ConfigField[] = [
  { section: "global", key: "auto-update", label: "启动时自动更新", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "global", key: "gh-proxy", label: "GitHub 代理加速", type: "text", desc: "无法从 GitHub 获取更新时设置" },
  { section: "global", key: "cf-bypass", label: "Cloudflare 绕过地址", type: "text", desc: "详见 https://github.com/sarperavci/CloudflareBypassForScraping" },
  { section: "download", key: "download-path", label: "下载路径", type: "text", desc: "相对于 so-novel 工作目录" },
  { section: "download", key: "extname", label: "下载格式", type: "select", options: ["epub", "txt", "html", "pdf"], desc: "默认 epub" },
  { section: "download", key: "txt-encoding", label: "TXT 编码", type: "select", options: ["UTF-8", "GBK"], desc: "下载格式为 txt 时有效" },
  { section: "download", key: "preserve-chapter-cache", label: "保留章节缓存", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "source", key: "language", label: "书籍内容语言", type: "select", options: ["", "zh_CN", "zh_TW", "zh_Hant"], desc: "默认自动" },
  { section: "source", key: "active-rules", label: "激活规则文件", type: "text", desc: "规则文件路径" },
  { section: "source", key: "source-id", label: "指定书源 ID", type: "text", desc: "用于指定搜索、批量下载" },
  { section: "source", key: "search-limit", label: "搜索结果上限", type: "number", desc: "每个书源显示的前 N 条" },
  { section: "source", key: "search-filter", label: "优化搜索结果", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "crawl", key: "concurrency", label: "并发上限", type: "number", desc: "默认 50" },
  { section: "crawl", key: "min-interval", label: "最小间隔 (毫秒)", type: "number", desc: "" },
  { section: "crawl", key: "max-interval", label: "最大间隔 (毫秒)", type: "number", desc: "" },
  { section: "crawl", key: "enable-retry", label: "启用重试", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "crawl", key: "max-retries", label: "最大重试次数", type: "number", desc: "针对首次下载失败的章节" },
  { section: "crawl", key: "retry-min-interval", label: "重试最小间隔 (毫秒)", type: "number", desc: "" },
  { section: "crawl", key: "retry-max-interval", label: "重试最大间隔 (毫秒)", type: "number", desc: "" },
  { section: "web", key: "enabled", label: "启用 Web 服务", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "web", key: "port", label: "Web 服务端口", type: "number", desc: "" },
  { section: "cookie", key: "qidian", label: "起点 Cookie", type: "text", desc: "填写 w_tsfp=xxx 以获取最新封面" },
  { section: "proxy", key: "enabled", label: "启用 HTTP 代理", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "proxy", key: "host", label: "代理地址", type: "text", desc: "" },
  { section: "proxy", key: "port", label: "代理端口", type: "text", desc: "" },
];

interface ParsedConfig {
  [section: string]: { [key: string]: string };
}

// Lines that are not in CONFIG_FIELDS, preserved as raw lines
interface ExtraLine {
  line: string;
}

function parseIni(text: string): { config: ParsedConfig; extraLines: ExtraLine[] } {
  const config: ParsedConfig = {};
  const extraLines: ExtraLine[] = [];
  let currentSection = "";
  const knownKeys = new Set(CONFIG_FIELDS.map((f) => `${f.section}.${f.key}`));

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      extraLines.push({ line: rawLine });
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      if (!config[currentSection]) {
        config[currentSection] = {};
      }
      extraLines.push({ line: rawLine });
      continue;
    }
    if (line.includes("=")) {
      const eqIdx = line.indexOf("=");
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      const fullKey = `${currentSection}.${key}`;
      if (knownKeys.has(fullKey) && currentSection) {
        if (!config[currentSection]) config[currentSection] = {};
        config[currentSection][key] = value;
      } else {
        extraLines.push({ line: rawLine });
      }
    } else {
      extraLines.push({ line: rawLine });
    }
  }
  return { config, extraLines };
}

function dumpIni(config: ParsedConfig, extraLines: ExtraLine[]): string {
  const sections: string[] = [];

  for (const entry of extraLines) {
    if (entry.line.trim() === "") {
      sections.push("");
    } else if (entry.line.trim().startsWith("#")) {
      sections.push(entry.line);
    } else if (entry.line.trim().startsWith("[") && entry.line.trim().endsWith("]")) {
      sections.push(entry.line);
    } else if (entry.line.includes("=")) {
      // This is an extra (unknown) key=value, preserve it
      sections.push(entry.line);
    }
  }

  for (const [section, kvs] of Object.entries(config)) {
    const sectionLines: string[] = [];
    for (const [key, value] of Object.entries(kvs)) {
      sectionLines.push(`${key} = ${value}`);
    }
    if (sectionLines.length > 0) {
      sections.push(`[${section}]`);
      sections.push(...sectionLines);
      sections.push("");
    }
  }
  return sections.join("\n");
}

function getFieldValue(config: ParsedConfig, field: ConfigField): string {
  return config[field.section]?.[field.key] ?? "";
}

function setFieldValue(config: ParsedConfig, field: ConfigField, value: string) {
  if (!config[field.section]) {
    config[field.section] = {};
  }
  config[field.section][field.key] = value;
}

function buildConfigFromForm(
  config: ParsedConfig,
  formData: Record<string, string>
): ParsedConfig {
  const result = JSON.parse(JSON.stringify(config)) as ParsedConfig;
  for (const field of CONFIG_FIELDS) {
    const inputValue = formData[`${field.section}.${field.key}`];
    if (inputValue !== undefined) {
      setFieldValue(result, field, inputValue);
    }
  }
  return result;
}

export function renderSoNovelConfigPage(): string {
  return `
    <div class="page page-integration">
      <header class="page-header">
        <h1>so-novel 配置</h1>
        <button class="btn-icon" data-nav="/integration" title="返回">&#x2190;</button>
      </header>

      <div class="config-mode-tabs">
        <button class="tab-btn active" data-mode="smart">傻瓜模式</button>
        <button class="tab-btn" data-mode="text">文本编辑</button>
      </div>

      <div id="smart-editor" class="config-smart-editor">
        <div class="config-form-grid" id="config-form-grid"></div>
        <div class="config-form-actions">
          <button class="btn-primary" id="save-smart-btn">保存配置</button>
          <button class="btn-secondary" id="reset-config-btn">恢复默认</button>
          <button class="btn-secondary" id="goto-rules-btn">规则管理</button>
        </div>
      </div>

      <div id="text-editor" class="config-text-editor hidden">
        <div class="config-textarea-wrapper">
          <textarea id="config-editor" class="config-textarea" spellcheck="false"></textarea>
        </div>
        <div class="config-text-actions">
          <button class="btn-primary" id="save-text-btn">保存文本</button>
          <button class="btn-secondary" id="reset-text-btn">恢复默认</button>
        </div>
      </div>
    </div>
  `;
}

export async function initSoNovelConfigHandlers(container: HTMLElement): Promise<void> {
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  const smartEditor = container.querySelector<HTMLElement>("#smart-editor");
  const textEditor = container.querySelector<HTMLElement>("#text-editor");
  const formGrid = container.querySelector<HTMLElement>("#config-form-grid");
  const textarea = container.querySelector<HTMLTextAreaElement>("#config-editor");
  const saveSmartBtn = container.querySelector<HTMLButtonElement>("#save-smart-btn");
  const saveTextBtn = container.querySelector<HTMLButtonElement>("#save-text-btn");
  const resetSmartBtn = container.querySelector<HTMLButtonElement>("#reset-config-btn");
  const resetTextBtn = container.querySelector<HTMLButtonElement>("#reset-text-btn");
  const gotoRulesBtn = container.querySelector<HTMLButtonElement>("#goto-rules-btn");
  const tabBtns = container.querySelectorAll<HTMLButtonElement>("[data-mode]");

  let currentConfig: ParsedConfig = {};
  let extraLines: ExtraLine[] = [];
  let rawText = "";

  async function loadConfig() {
    rawText = await getSoNovelConfig();
    const parsed = parseIni(rawText);
    currentConfig = parsed.config;
    extraLines = parsed.extraLines;
  }

  function renderSmartEditor() {
    if (!formGrid) return;

    const sections = [...new Set(CONFIG_FIELDS.map((f) => f.section))];
    let html = "";

    for (const section of sections) {
      const fields = CONFIG_FIELDS.filter((f) => f.section === section);
      html += `
        <div class="config-section">
          <h3 class="config-section-title">${section}</h3>
          <div class="config-fields">
            ${fields
              .map((field) => {
                const value = getFieldValue(currentConfig, field);
                const name = `${field.section}.${field.key}`;
                if (field.type === "select") {
                  return `
                    <div class="form-group">
                      <label>${field.label}</label>
                      <select class="form-input" name="${name}">
                        ${field.options!.map((opt) => `<option value="${opt}" ${opt === value ? "selected" : ""}>${opt || "(空)"}</option>`).join("")}
                      </select>
                      ${field.desc ? `<span class="field-desc">${field.desc}</span>` : ""}
                    </div>
                  `;
                } else if (field.type === "number") {
                  return `
                    <div class="form-group">
                      <label>${field.label}</label>
                      <input type="number" class="form-input" name="${name}" value="${value}" />
                      ${field.desc ? `<span class="field-desc">${field.desc}</span>` : ""}
                    </div>
                  `;
                } else {
                  return `
                    <div class="form-group">
                      <label>${field.label}</label>
                      <input type="text" class="form-input" name="${name}" value="${value}" />
                      ${field.desc ? `<span class="field-desc">${field.desc}</span>` : ""}
                    </div>
                  `;
                }
              })
              .join("")}
          </div>
        </div>
      `;
    }

    formGrid.innerHTML = html;
  }

  function switchMode(mode: "smart" | "text") {
    if (mode === "smart") {
      smartEditor?.classList.remove("hidden");
      textEditor?.classList.add("hidden");
      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === "smart"));
    } else {
      smartEditor?.classList.add("hidden");
      textEditor?.classList.remove("hidden");
      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === "text"));
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode as "smart" | "text"));
  });

  saveSmartBtn?.addEventListener("click", async () => {
    const formData: Record<string, string> = {};
    formGrid?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => {
      formData[el.getAttribute("name")!] = el.value;
    });
    const newConfig = buildConfigFromForm(currentConfig, formData);
    try {
      await saveSoNovelConfig(dumpIni(newConfig, extraLines));
      navigate("/integration");
    } catch (e) {
      alert(`保存失败: ${e}`);
    }
  });

  saveTextBtn?.addEventListener("click", async () => {
    if (!textarea) return;
    try {
      await saveSoNovelConfig(textarea.value);
      navigate("/integration");
    } catch (e) {
      alert(`保存失败: ${e}`);
    }
  });

  resetSmartBtn?.addEventListener("click", async () => {
    if (!confirm("确定恢复默认配置？当前修改将被丢弃。")) return;
    try {
      await resetSoNovelConfig();
      await loadConfig();
      renderSmartEditor();
      if (textarea) textarea.value = rawText;
    } catch (e) {
      alert(`恢复失败: ${e}`);
    }
  });

  resetTextBtn?.addEventListener("click", async () => {
    if (!confirm("确定恢复默认配置？当前修改将被丢弃。")) return;
    try {
      await resetSoNovelConfig();
      rawText = await getSoNovelConfig();
      if (textarea) textarea.value = rawText;
    } catch (e) {
      alert(`恢复失败: ${e}`);
    }
  });

  gotoRulesBtn?.addEventListener("click", () => {
    navigate("/integration/so-novel/rules");
  });

  await loadConfig();
  renderSmartEditor();
  if (textarea) textarea.value = rawText;
}
