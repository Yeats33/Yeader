import type { FeedItem } from "../types.ts";
import type { ViewType } from "../views/types.ts";
import { ViewDispatcher } from "../views/ViewDispatcher.tsx";
import { navigate } from "../router.ts";

interface RightPanelProps {
  item: FeedItem | null;
  viewType: ViewType;
}

export function RightPanel({ item, viewType }: RightPanelProps) {
  if (item?.mediaType === "novel") {
    return (
      <main className="right-panel">
        <div className="right-panel-header">
          <h2>{item.title}</h2>
          <button
            className="open-external"
            type="button"
            onClick={() => navigate(`/reader/${encodeURIComponent(item.url)}`)}
          >
            继续阅读
          </button>
        </div>
        <div className="right-panel-scroll">
          <article className="article-content">
            {item.imageUrl ? <img className="book-detail-cover" src={item.imageUrl} alt={item.title} /> : null}
            <h1>{item.title}</h1>
            <div className="article-meta">
              {item.author ? <span>{item.author}</span> : null}
              {item.progressLabel ? <span>{item.author ? " · " : ""}{item.progressLabel}</span> : null}
            </div>
            {item.summary ? <p>{stripHtml(item.summary)}</p> : <p>暂无简介。</p>}
          </article>
        </div>
      </main>
    );
  }

  return (
    <ViewDispatcher
      viewType={viewType}
      item={(item as unknown as Record<string, unknown>) ?? null}
    />
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
