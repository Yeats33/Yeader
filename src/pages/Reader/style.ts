import type { ReaderState } from "./types.ts";
import {
  getReaderStyle,
  saveReaderStyle,
} from "../../api.ts";

export function applyReaderStyle(state: ReaderState): void {
  const root = document.documentElement;
  root.style.setProperty("--font-size", `${state.fontSize}px`);
  root.style.setProperty("--line-height", `${state.lineHeight}`);
  root.style.setProperty("--font-family", `"${state.fontFamily}", sans-serif`);
}

export function applyReaderStyleToContent(state: ReaderState): void {
  const chapterContent = document.querySelector(".chapter-content");
  if (chapterContent) {
    (chapterContent as HTMLElement).style.fontFamily = `"${state.fontFamily}", sans-serif`;
    (chapterContent as HTMLElement).style.fontSize = `${state.fontSize}px`;
    (chapterContent as HTMLElement).style.lineHeight = String(state.lineHeight);
  }
}

export async function loadReaderStyle(state: ReaderState): Promise<void> {
  try {
    const style = await getReaderStyle();
    state.fontSize = style.font_size || 16;
    state.lineHeight = style.line_height || 1.6;
    state.fontFamily = style.font_family || "Noto Serif";
    state.theme = (style.theme as typeof state.theme) || "light";
    applyReaderStyle(state);
  } catch (e) {
    console.error("[Reader] loadReaderStyle failed:", e);
  }
}

export async function saveReaderStyleSettings(state: ReaderState): Promise<void> {
  try {
    await saveReaderStyle(state.fontFamily, state.fontSize, state.lineHeight, state.theme);
  } catch (e) {
    console.error("[Reader] saveReaderStyle failed:", e);
  }
}