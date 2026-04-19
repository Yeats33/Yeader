import type { Theme } from "./themeManager";

interface ContentTheme {
  body: Record<string, string>;
  p: Record<string, string>;
  h1: Record<string, string>;
  h2: Record<string, string>;
  h3: Record<string, string>;
  "*": Record<string, string>;
}

const contentThemes: Record<Theme, ContentTheme> = {
  light: {
    body: { "background-color": "#ffffff", color: "#303133" },
    p: { "color": "#303133" },
    h1: { "color": "#1a1a1a" },
    h2: { "color": "#2a2a2a" },
    h3: { "color": "#3a3a3a" },
    "*": { "background-color": "transparent" },
  },
  dark: {
    body: { "background-color": "#1a1a1a", color: "#e5e5e5" },
    p: { "color": "#e5e5e5" },
    h1: { "color": "#ffffff" },
    h2: { "color": "#f0f0f0" },
    h3: { "color": "#d0d0d0" },
    "*": { "background-color": "transparent" },
  },
  sepia: {
    body: { "background-color": "#f4f1ea", color: "#4a4a3a" },
    p: { "color": "#4a4a3a" },
    h1: { "color": "#3a3a2a" },
    h2: { "color": "#4a4a3a" },
    h3: { "color": "#5a5a4a" },
    "*": { "background-color": "transparent" },
  },
};

export function getBookContentTheme(theme: Theme): ContentTheme {
  return contentThemes[theme];
}
