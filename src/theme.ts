/* ============================================================
   Theme Management — Yeader
   ============================================================ */

export type ThemeName = "apple" | "mintlify";
export type ColorMode = "light" | "dark";
export type CustomTheme = {
  name: string;
  css: string;
};

const THEME_STORAGE_KEY = "yeader-theme";
const COLOR_MODE_KEY = "yeader-color-mode";
const CUSTOM_THEMES_KEY = "yeader-custom-themes";
const CUSTOM_CSS_KEY = "yeader-custom-css";

const BASE_THEMES: ThemeName[] = ["apple", "mintlify"];

export function getCurrentTheme(): ThemeName {
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeName) ?? "apple";
}

export function setCurrentTheme(theme: ThemeName): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme, getColorMode());
}

export function getColorMode(): ColorMode {
  return (localStorage.getItem(COLOR_MODE_KEY) as ColorMode) ?? "light";
}

export function setColorMode(mode: ColorMode): void {
  localStorage.setItem(COLOR_MODE_KEY, mode);
  applyTheme(getCurrentTheme(), mode);
}

export function toggleColorMode(): ColorMode {
  const next = getColorMode() === "light" ? "dark" : "light";
  setColorMode(next);
  return next;
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
  applyTheme(getCurrentTheme(), getColorMode());
}

export function applyTheme(theme: ThemeName, colorMode: ColorMode): void {
  // Remove all theme attributes
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-color-mode");

  // Remove old theme link + custom CSS style
  document.querySelectorAll('link[data-theme-link]').forEach((el) => el.remove());
  document.querySelectorAll('style[data-custom-css]').forEach((el) => el.remove());

  // Set base theme (apple or mintlify)
  if (BASE_THEMES.includes(theme)) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  // Set color mode
  document.documentElement.setAttribute("data-color-mode", colorMode);
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

export async function loadTheme(theme: ThemeName, colorMode: ColorMode): Promise<void> {
  if (theme === "mintlify") {
    await loadThemeLink("/themes/mintlify.css");
  } else {
    // apple is default baked into styles.css
    await loadThemeLink("/themes/apple.css");
  }
  applyTheme(theme, colorMode);
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
    { name: "apple", label: "Apple" },
    { name: "mintlify", label: "Mintlify" },
    ...getCustomThemes().map((t) => ({ name: t.name, label: t.name })),
  ];
}
