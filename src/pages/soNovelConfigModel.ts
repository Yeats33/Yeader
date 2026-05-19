export type ConfigField = {
  section: string;
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  desc?: string;
};

export type ParsedConfig = Record<string, Record<string, string>>;

type ConfigLine =
  | { kind: "section"; section: string; raw: string }
  | { kind: "known"; section: string; key: string }
  | { kind: "raw"; raw: string };

export type ParsedIni = {
  config: ParsedConfig;
  lines: ConfigLine[];
};

export const CONFIG_FIELDS: ConfigField[] = [
  { section: "global", key: "auto-update", label: "启动时自动更新", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "global", key: "gh-proxy", label: "GitHub 代理加速", type: "text", desc: "无法从 GitHub 获取更新时设置" },
  { section: "global", key: "cf-bypass", label: "Cloudflare 绕过地址", type: "text", desc: "详见 https://github.com/sarperavci/CloudflareBypassForScraping" },
  { section: "download", key: "download-path", label: "下载路径", type: "text", desc: "相对于 so-novel 工作目录" },
  { section: "download", key: "extname", label: "下载格式", type: "select", options: ["epub", "txt", "html", "pdf"], desc: "默认 epub" },
  { section: "download", key: "txt-encoding", label: "TXT 编码", type: "select", options: ["", "UTF-8", "GBK"], desc: "下载格式为 txt 时有效" },
  { section: "download", key: "preserve-chapter-cache", label: "保留章节缓存", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "source", key: "language", label: "书籍内容语言", type: "select", options: ["", "zh_CN", "zh_TW", "zh_Hant"], desc: "默认自动" },
  { section: "source", key: "active-rules", label: "激活规则文件", type: "text", desc: "规则文件路径" },
  { section: "source", key: "source-id", label: "指定书源 ID", type: "text", desc: "用于指定搜索、批量下载" },
  { section: "source", key: "search-limit", label: "搜索结果上限", type: "number", desc: "每个书源显示的前 N 条" },
  { section: "source", key: "search-filter", label: "优化搜索结果", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "crawl", key: "concurrency", label: "并发上限", type: "number", desc: "默认 50" },
  { section: "crawl", key: "min-interval", label: "最小间隔 (毫秒)", type: "number" },
  { section: "crawl", key: "max-interval", label: "最大间隔 (毫秒)", type: "number" },
  { section: "crawl", key: "enable-retry", label: "启用重试", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "crawl", key: "max-retries", label: "最大重试次数", type: "number", desc: "针对首次下载失败的章节" },
  { section: "crawl", key: "retry-min-interval", label: "重试最小间隔 (毫秒)", type: "number" },
  { section: "crawl", key: "retry-max-interval", label: "重试最大间隔 (毫秒)", type: "number" },
  { section: "web", key: "enabled", label: "启用 Web 服务", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "web", key: "port", label: "Web 服务端口", type: "number" },
  { section: "cookie", key: "qidian", label: "起点 Cookie", type: "text", desc: "填写 w_tsfp=xxx 以获取最新封面" },
  { section: "proxy", key: "enabled", label: "启用 HTTP 代理", type: "select", options: ["0", "1"], desc: "1 开，0 关" },
  { section: "proxy", key: "host", label: "代理地址", type: "text" },
  { section: "proxy", key: "port", label: "代理端口", type: "text" },
];

const KNOWN_KEYS = new Set(CONFIG_FIELDS.map((field) => `${field.section}.${field.key}`));

export function parseIni(text: string): ParsedIni {
  const config: ParsedConfig = {};
  const lines: ConfigLine[] = [];
  let currentSection = "";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      config[currentSection] ??= {};
      lines.push({ kind: "section", section: currentSection, raw: rawLine });
      continue;
    }

    if (line.includes("=") && currentSection) {
      const eqIdx = line.indexOf("=");
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (KNOWN_KEYS.has(`${currentSection}.${key}`)) {
        config[currentSection] ??= {};
        config[currentSection][key] = value;
        lines.push({ kind: "known", section: currentSection, key });
        continue;
      }
    }

    lines.push({ kind: "raw", raw: rawLine });
  }

  return { config, lines };
}

export function dumpIni(parsed: ParsedIni): string {
  const emitted = new Set<string>();
  const output = parsed.lines.map((line) => {
    if (line.kind === "known") {
      emitted.add(`${line.section}.${line.key}`);
      return `${line.key} = ${parsed.config[line.section]?.[line.key] ?? ""}`;
    }
    return line.kind === "section" ? line.raw : line.raw;
  });

  for (const field of CONFIG_FIELDS) {
    const fullKey = `${field.section}.${field.key}`;
    const value = parsed.config[field.section]?.[field.key];
    if (value === undefined || emitted.has(fullKey)) continue;
    output.push(`[${field.section}]`, `${field.key} = ${value}`);
  }

  return output.join("\n");
}

export function getFieldValue(config: ParsedConfig, field: ConfigField): string {
  return config[field.section]?.[field.key] ?? "";
}

export function setFieldValue(config: ParsedConfig, field: ConfigField, value: string): ParsedConfig {
  return {
    ...config,
    [field.section]: {
      ...(config[field.section] ?? {}),
      [field.key]: value,
    },
  };
}

export function updateConfigValue(
  config: ParsedConfig,
  section: string,
  key: string,
  value: string,
): ParsedConfig {
  const field = CONFIG_FIELDS.find((item) => item.section === section && item.key === key);
  if (!field) return config;
  return setFieldValue(config, field, value);
}
