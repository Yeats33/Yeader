export type Theme = "light" | "dark" | "sepia";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
}

export interface ThemeConfig {
  key: Theme;
  label: string;
  colors: ThemeColors;
}

export const THEME_CONFIGS: ThemeConfig[] = [
  {
    key: "light",
    label: "浅色模式",
    colors: {
      background: "#ffffff",
      surface: "#f5f5f5",
      text: "#303133",
      textSecondary: "#606266",
      border: "#e0e0e0",
      accent: "#409eff",
    },
  },
  {
    key: "dark",
    label: "深色模式",
    colors: {
      background: "#1a1a1a",
      surface: "#2c2c2c",
      text: "#e5e5e5",
      textSecondary: "#b3b3b3",
      border: "#404040",
      accent: "#66b1ff",
    },
  },
  {
    key: "sepia",
    label: "护眼模式",
    colors: {
      background: "#f4f1ea",
      surface: "#ebe5d6",
      text: "#4a4a3a",
      textSecondary: "#6a6a5a",
      border: "#d4c5a9",
      accent: "#8b7355",
    },
  },
];

export class ThemeManager {
  private currentTheme: Theme = "light";

  constructor() {
    this.loadThemeFromStorage();
  }

  private loadThemeFromStorage() {
    try {
      const saved = localStorage.getItem("app-theme");
      if (saved && this.isValidTheme(saved)) {
        this.currentTheme = saved as Theme;
      }
    } catch {}
  }

  private isValidTheme(theme: string): theme is Theme {
    return THEME_CONFIGS.some((c) => c.key === theme);
  }

  public getAvailableThemes(): ThemeConfig[] {
    return THEME_CONFIGS;
  }

  public getThemeConfig(theme?: Theme): ThemeConfig {
    const target = theme || this.currentTheme;
    return THEME_CONFIGS.find((c) => c.key === target) || THEME_CONFIGS[0];
  }

  public getNextTheme(): Theme {
    const themes = THEME_CONFIGS.map((c) => c.key);
    const idx = themes.indexOf(this.currentTheme);
    return themes[(idx + 1) % themes.length];
  }

  public toggleToNextTheme(): Theme {
    const next = this.getNextTheme();
    this.setTheme(next);
    return next;
  }

  public setTheme(theme: Theme) {
    this.currentTheme = theme;
    this.applyTheme(theme);
    localStorage.setItem("app-theme", theme);
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme } }));
  }

  public getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  private applyTheme(theme: Theme) {
    const colors = this.getThemeConfig(theme).colors;
    const root = document.documentElement;

    root.style.setProperty("--app-background", colors.background);
    root.style.setProperty("--app-surface", colors.surface);
    root.style.setProperty("--app-text-color", colors.text);
    root.style.setProperty("--app-text-secondary", colors.textSecondary);
    root.style.setProperty("--app-border", colors.border);
    root.style.setProperty("--app-accent", colors.accent);

    document.body.className = document.body.className.replace(/theme-\w+/g, "");
    document.body.classList.add(`theme-${theme}`);
  }

  public initializeTheme() {
    this.applyTheme(this.currentTheme);
  }
}

export const themeManager = new ThemeManager();
