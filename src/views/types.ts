import type { ReactNode } from "react";

export type ViewType = "reader" | "article" | "comic" | "bookshelf" | "player";

export type YeaderMediaType = "novel" | "rss" | "comic" | "audio" | "video" | "generic";

/** Default mediaType → ViewType mapping used when no override is set. */
export const MEDIA_TYPE_DEFAULT_VIEW: Record<YeaderMediaType, ViewType> = {
  novel: "reader",
  rss: "article",
  comic: "comic",
  audio: "player",
  video: "player",
  generic: "article",
};

export interface ViewProps {
  /** The item data to render. Shape depends on the source mediaType. */
  item: Record<string, unknown> | null;
  /** Called when the view wants to navigate elsewhere. */
  onNavigate?: (path: string) => void;
}

export interface ViewDefinition {
  type: ViewType;
  label: string;
  description: string;
  render: (props: ViewProps) => ReactNode;
}

/**
 * Resolve the effective view for a subscription item.
 *
 * Priority chain:
 *  1. subscription-level explicit view
 *  2. source-level default view (from plugin/script/json)
 *  3. mediaType fallback
 */
export function resolveView(
  subscriptionView?: ViewType | null,
  sourceDefaultView?: ViewType | null,
  mediaType?: YeaderMediaType,
): ViewType {
  if (subscriptionView) return subscriptionView;
  if (sourceDefaultView) return sourceDefaultView;
  if (mediaType) return MEDIA_TYPE_DEFAULT_VIEW[mediaType];
  return "article";
}
