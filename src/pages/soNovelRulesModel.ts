export type OfficialRule = {
  name: string;
  label: string;
  desc: string;
  url: string;
};

export type RuleAction =
  | "download-official"
  | "update-official"
  | "activate-official"
  | "activate-custom"
  | "delete-custom"
  | "import-custom";

export const OFFICIAL_RULES: OfficialRule[] = [
  {
    name: "main",
    label: "main.json",
    desc: "官方默认规则，覆盖绝大多数书源",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/main.json",
  },
  {
    name: "cloudflare",
    label: "cloudflare.json",
    desc: "用于需要绕过 Cloudflare 验证的站点",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/cloudflare.json",
  },
  {
    name: "no-search",
    label: "no-search.json",
    desc: "仅支持批量下载，不支持搜索的规则",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/no-search.json",
  },
  {
    name: "proxy-required",
    label: "proxy-required.json",
    desc: "需要代理才能访问的站点规则",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/proxy-required.json",
  },
  {
    name: "rate-limit",
    label: "rate-limit.json",
    desc: "限流站点规则，降低并发避免封号",
    url: "https://raw.githubusercontent.com/freeok/so-novel/main/bundle/rules/rate-limit.json",
  },
];

export function officialRuleNameForLabel(label: string): string {
  return label.endsWith(".json") ? label.slice(0, -5) : label;
}

export function isOfficialInstalled(label: string, customRules: string[]): boolean {
  return customRules.includes(officialRuleNameForLabel(label));
}

export function isOfficialActive(label: string, activeRule: string): boolean {
  return activeRule === label;
}

export function customOnlyRules(rules: string[]): string[] {
  const officialNames = new Set(OFFICIAL_RULES.map((rule) => rule.name));
  return rules.filter((name) => !officialNames.has(name));
}

export function activeRuleFileName(ruleName: string): string {
  return `${ruleName}.json`;
}

export function validateRuleImport(name: string, content: string): string | null {
  if (!name.trim()) return "请输入规则名称";
  if (!content.trim()) return "请输入 JSON 内容";
  if (!/^[A-Za-z0-9_-]+$/.test(name.trim())) {
    return "规则名称只能包含字母、数字、下划线和短横线";
  }
  return null;
}
