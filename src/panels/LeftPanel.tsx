import type { FeedSource } from "../types.ts";

interface LeftPanelProps {
  sources: FeedSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  onAddSource: () => void;
}

const VIRTUAL_COLLECTIONS = [
  { id: "all", label: "All Items", icon: "📥" },
  { id: "starred", label: "Starred", icon: "⭐" },
];

export function LeftPanel({ sources, selectedSourceId, onSelectSource, onAddSource }: LeftPanelProps) {
  return (
    <aside className="left-panel">
      <div className="left-panel-header">
        <h2>Yeader</h2>
        <button type="button" onClick={onAddSource} title="Add Source">
          +
        </button>
      </div>

      <div className="left-panel-scroll">
        <div className="panel-section">
          <div className="panel-section-title">Collections</div>
          {VIRTUAL_COLLECTIONS.map((col) => (
            <div
              key={col.id}
              className={`source-item${selectedSourceId === col.id ? " selected" : ""}`}
              onClick={() => onSelectSource(col.id)}
            >
              <span className="source-icon">{col.icon}</span>
              <span className="source-name">{col.label}</span>
            </div>
          ))}
        </div>

        <div className="panel-section">
          <div className="panel-section-title">Sources</div>
          {sources.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "13px", color: "var(--color-text-muted)" }}>
              No sources yet. Click + to add an RSS/Atom feed.
            </div>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className={`source-item${selectedSourceId === source.id ? " selected" : ""}`}
                onClick={() => onSelectSource(source.id)}
              >
                {source.iconUrl ? (
                  <img className="source-icon" src={source.iconUrl} alt="" />
                ) : (
                  <span className="source-icon">🔗</span>
                )}
                <span className="source-name">{source.title}</span>
                <span className="source-badge">RSS</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
