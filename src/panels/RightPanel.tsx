import type { FeedItem } from "../types.ts";
import type { ViewType } from "../views/types.ts";
import { ViewDispatcher } from "../views/ViewDispatcher.tsx";

interface RightPanelProps {
  item: FeedItem | null;
  viewType: ViewType;
}

export function RightPanel({ item, viewType }: RightPanelProps) {
  return (
    <ViewDispatcher
      viewType={viewType}
      item={(item as unknown as Record<string, unknown>) ?? null}
    />
  );
}
