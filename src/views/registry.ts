import type { ViewDefinition, ViewType } from "./types.ts";
import { ArticleView } from "./ArticleView.tsx";
import { BookshelfView } from "./BookshelfView.tsx";

/**
 * Registry of built-in views.
 *
 * Plugin-sourced views can be added at runtime via `registerView()`.
 */
const registry = new Map<ViewType, ViewDefinition>();

/** Register a view definition. Plugins use this to provide custom views. */
export function registerView(def: ViewDefinition): void {
  registry.set(def.type, def);
}

/** Look up a view by type. Returns undefined if not registered. */
export function getView(type: ViewType): ViewDefinition | undefined {
  return registry.get(type);
}

/** All registered view types. */
export function registeredViewTypes(): ViewType[] {
  return Array.from(registry.keys());
}

// ── Built-in views ──────────────────────────────────────────────

registerView({
  type: "article",
  label: "文章",
  description: "RSS / Atom article reader with sanitized HTML",
  render: ArticleView,
});

registerView({
  type: "bookshelf",
  label: "书架",
  description: "Grid bookshelf for browsing book collections",
  render: BookshelfView,
});

// "reader" — delegated to ReaderPage (handles EPUB parsing + chapter nav).
// Registered at app init or lazily to avoid pulling the full reader bundle.
// "comic"  — image viewer (placeholder).
// "player" — audio/video player (placeholder).
