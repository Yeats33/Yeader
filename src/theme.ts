/* ============================================================
   Theme Management — Yeader
   ============================================================ */

export type ThemeName = "default" | "apple" | "mintlify" | "raycast";
export type ColorMode = "light" | "dark";
export type ColorModePreference = ColorMode | "system";
export type CustomTheme = {
  name: string;
  css: string;
};

const THEME_STORAGE_KEY = "yeader-theme";
const COLOR_MODE_KEY = "yeader-color-mode";
const CUSTOM_THEMES_KEY = "yeader-custom-themes";
const CUSTOM_CSS_KEY = "yeader-custom-css";

const BASE_THEMES: ThemeName[] = ["apple", "mintlify", "raycast"];

export function getCurrentTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "default" || stored === "apple" || stored === "mintlify" || stored === "raycast") {
    return stored;
  }
  return "default";
}

export function setCurrentTheme(theme: ThemeName): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  void loadTheme(theme, getColorModePreference()).catch(() => {
    applyTheme(theme, getColorModePreference());
  });
}

export function getColorModePreference(): ColorModePreference {
  const stored = localStorage.getItem(COLOR_MODE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function getColorMode(): ColorMode {
  return resolveColorMode(getColorModePreference());
}

export function setColorMode(mode: ColorModePreference): void {
  localStorage.setItem(COLOR_MODE_KEY, mode);
  applyTheme(getCurrentTheme(), mode);
}

export function toggleColorMode(): ColorMode {
  const next = getColorMode() === "light" ? "dark" : "light";
  setColorMode(next);
  return next;
}

export function resolveColorMode(preference: ColorModePreference): ColorMode {
  if (preference !== "system") {
    return preference;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getCustomThemes(): CustomTheme[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveCustomTheme(name: string, css: string): void {
  const themes = getCustomThemes();
  const existing = themes.findIndex((t) => t.name === name);
  if (existing >= 0) {
    themes[existing] = { name, css };
  } else {
    themes.push({ name, css });
  }
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

export function deleteCustomTheme(name: string): void {
  const themes = getCustomThemes().filter((t) => t.name !== name);
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

export function getCustomCss(): string {
  return localStorage.getItem(CUSTOM_CSS_KEY) ?? "";
}

export function setCustomCss(css: string): void {
  if (css.trim()) {
    localStorage.setItem(CUSTOM_CSS_KEY, css);
  } else {
    localStorage.removeItem(CUSTOM_CSS_KEY);
  }
  applyTheme(getCurrentTheme(), getColorModePreference());
}

export function applyTheme(theme: ThemeName, colorModePreference: ColorModePreference): void {
  const colorMode = resolveColorMode(colorModePreference);

  // Remove all theme attributes
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-color-mode");
  document.documentElement.removeAttribute("data-color-mode-preference");

  // Remove old custom CSS style
  document.querySelectorAll('style[data-custom-css]').forEach((el) => el.remove());

  // Set base theme. The default theme is the root token set from base.css.
  if (BASE_THEMES.includes(theme)) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  // Set color mode
  document.documentElement.setAttribute("data-color-mode", colorMode);
  document.documentElement.setAttribute("data-color-mode-preference", colorModePreference);
  document.body.classList.toggle("dark-mode", colorMode === "dark");

  // Apply custom CSS last (overrides everything)
  const customCss = getCustomCss();
  if (customCss.trim()) {
    const style = document.createElement("style");
    style.setAttribute("data-custom-css", "");
    style.textContent = customCss;
    document.head.appendChild(style);
  }
}

export async function loadTheme(theme: ThemeName, colorModePreference: ColorModePreference): Promise<void> {
  if (theme !== "default") {
    await loadThemeLink(`/themes/${theme}.css`);
  }
  applyTheme(theme, colorModePreference);
}

export function watchSystemColorMode(): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) {
    return () => {};
  }
  const applySystemPreference = () => {
    if (getColorModePreference() === "system") {
      applyTheme(getCurrentTheme(), "system");
    }
  };
  media.addEventListener("change", applySystemPreference);
  return () => media.removeEventListener("change", applySystemPreference);
}

function loadThemeLink(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-theme-link][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-theme-link", "");
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load theme: ${href}`));
    document.head.appendChild(link);
  });
}

export function describeThemeOptions(): Array<{ name: string; label: string }> {
  return [
    { name: "default", label: "默认" },
    { name: "apple", label: "Apple" },
    { name: "mintlify", label: "Mintlify" },
    { name: "raycast", label: "Raycast" },
    ...getCustomThemes().map((t) => ({ name: t.name, label: t.name })),
  ];
}
