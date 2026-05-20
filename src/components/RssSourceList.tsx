import type { RssSourceWithItems } from "../pages/useRssSources";

interface RssSourceListProps {
  sources: RssSourceWithItems[];
  selectedUrl: string | null;
  loading: boolean;
  onSelect: (url: string) => void;
  onAdd: () => void;
  onDelete: (url: string) => void;
}

/**
 * @deprecated Unused legacy RSS list component. Keep as reference for RSS
 * source deletion, item counts, and last-fetched display while /feed is rebuilt.
 */
function formatLastFetched(lastFetched?: string): string {
  if (!lastFetched) return "从未更新";
  try {
    const date = new Date(lastFetched);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  } catch {
    return lastFetched;
  }
}

/**
 * @deprecated Use the /feed left panel for active subscription navigation.
 */
export function RssSourceList({
  sources,
  selectedUrl,
  loading,
  onSelect,
  onAdd,
  onDelete,
}: RssSourceListProps) {
  const enabledCount = sources.filter((s) => s.enabled).length;

  return (
    <div className="rss-source-list">
      <div className="rss-source-list-header">
        <h3>RSS订阅</h3>
        <button
          type="button"
          className="btn-icon"
          onClick={onAdd}
          title="添加RSS源"
        >
          +
        </button>
      </div>

      {loading ? (
        <div className="rss-source-loading">加载中...</div>
      ) : sources.length === 0 ? (
        <div className="rss-source-empty">
          <p>暂无RSS订阅</p>
          <button type="button" className="btn btn-secondary" onClick={onAdd}>
            添加源
          </button>
        </div>
      ) : (
        <div className="rss-source-items">
          {sources.map((source) => (
            <div
              key={source.sourceUrl}
              className={`rss-source-item${selectedUrl === source.sourceUrl ? " selected" : ""}${!source.enabled ? " disabled" : ""}`}
              onClick={() => source.enabled && onSelect(source.sourceUrl)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && source.enabled) {
                  onSelect(source.sourceUrl);
                }
              }}
            >
              <div className="rss-source-icon">
                {source.sourceIcon ? (
                  <img src={source.sourceIcon} alt="" loading="lazy" />
                ) : (
                  <span className="rss-default-icon">📰</span>
                )}
              </div>
              <div className="rss-source-info">
                <span className="rss-source-name">{source.sourceName}</span>
                <span className="rss-source-meta">
                  {source.itemCount !== undefined
                    ? `${source.itemCount}篇`
                    : "未同步"} · {formatLastFetched(source.lastFetched)}
                </span>
              </div>
              <button
                type="button"
                className="rss-source-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(source.sourceUrl);
                }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rss-source-footer">
        <span className="rss-source-count">
          启用: {enabledCount}/{sources.length}
        </span>
      </div>
    </div>
  );
}
