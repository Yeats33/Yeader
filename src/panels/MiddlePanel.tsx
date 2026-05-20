import type { FeedItem } from "../types.ts";

interface MiddlePanelProps {
  items: FeedItem[];
  selectedItemId: string | null;
  sourceName: string | null;
  loading: boolean;
  onSelectItem: (id: string) => void;
}

export function MiddlePanel({ items, selectedItemId, sourceName, loading, onSelectItem }: MiddlePanelProps) {
  if (!sourceName) {
    return (
      <section className="middle-panel">
        <div className="middle-panel-empty">选择一个订阅集合</div>
      </section>
    );
  }

  return (
    <section className="middle-panel">
      <div className="middle-panel-header">
        <h3>{sourceName}</h3>
        {!loading && <span className="item-count">{items.length} 项</span>}
      </div>

      <div className="middle-panel-scroll">
        {loading ? (
          <div className="middle-panel-empty">加载中...</div>
        ) : items.length === 0 ? (
          <div className="middle-panel-empty">暂无内容</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`feed-item${selectedItemId === item.id ? " selected" : ""}`}
              onClick={() => onSelectItem(item.id)}
            >
              <div className="feed-item-with-cover">
                {item.imageUrl ? <img className="feed-item-cover" src={item.imageUrl} alt="" loading="lazy" /> : null}
                <div className="feed-item-content">
                  <div className="feed-item-title">{item.title}</div>
                  <div className="feed-item-meta">
                    {item.mediaType === "novel" ? "书籍 · " : ""}
                    {item.author ? `${item.author} · ` : ""}
                    {item.progressLabel ?? (item.published ? formatDate(item.published) : "")}
                  </div>
                  {item.summary ? <div className="feed-item-summary">{stripHtml(item.summary)}</div> : null}
                  {item.latestEntry ? <div className="feed-item-chapter">{item.latestEntry}</div> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
