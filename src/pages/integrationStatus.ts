export type IntegrationStatus = "checking" | "installed" | "missing" | "error";

export type SoNovelState = {
  status: IntegrationStatus;
  version: string;
  running: boolean | null;
  error: string | null;
};

export const SO_NOVEL_GITHUB = "https://github.com/freeok/so-novel";
export const SO_NOVEL_DESC = "已废弃的兼容桥接；新内容接入应迁移到 YeaderHub 插件或本地规则源。";

export const INITIAL_SO_NOVEL_STATE: SoNovelState = {
  status: "checking",
  version: "",
  running: null,
  error: null,
};

export function cleanCommandVersion(raw: string): string {
  return raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

export function soNovelStatusLabel(state: SoNovelState): string {
  if (state.status === "installed") {
    return state.running ? "运行中" : "已安装";
  }
  if (state.status === "missing") {
    return "未安装";
  }
  if (state.status === "error") {
    return "检查失败";
  }
  return "检查中...";
}

export function soNovelDescription(state: SoNovelState): string {
  if (state.status === "installed") {
    return SO_NOVEL_DESC;
  }
  if (state.status === "missing") {
    return "已废弃，不建议新安装";
  }
  if (state.status === "error") {
    return state.error ?? "无法检查安装状态";
  }
  return "正在检查安装状态...";
}
