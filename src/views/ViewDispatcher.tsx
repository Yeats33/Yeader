import type { ViewType } from "./types.ts";
import { getView } from "./registry.ts";
import type { ReactNode } from "react";

interface ViewDispatcherProps {
  viewType: ViewType;
  item: Record<string, unknown> | null;
  onNavigate?: (path: string) => void;
}

export function ViewDispatcher({ viewType, item, onNavigate }: ViewDispatcherProps): ReactNode {
  const def = getView(viewType);

  if (!def) {
    return (
      <main className="right-panel">
        <div className="right-panel-empty">
          View "{viewType}" is not available
        </div>
      </main>
    );
  }

  return def.render({ item, onNavigate });
}
