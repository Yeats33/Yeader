import { openUrl } from "../api.ts";

interface ArticleViewProps {
  item: Record<string, unknown> | null;
}

export function ArticleView({ item }: ArticleViewProps) {
  if (!item) {
    return (
      <main className="right-panel">
        <div className="right-panel-empty">Select an item to read</div>
      </main>
    );
  }

  const title = (item.title as string) ?? "";
  const author = (item.author as string) ?? "";
  const url = (item.url as string) ?? "";
  const published = (item.published as string) ?? "";
  const contentHtml = (item.contentHtml as string) ?? "";
  const summary = (item.summary as string) ?? "";
  const hasContent = contentHtml || summary;

  return (
    <main className="right-panel">
      <div className="right-panel-header">
        <h2>{title}</h2>
        {url ? (
          <button
            type="button"
            className="open-external"
            onClick={() => openUrl(url).catch(() => {})}
            title="Open in browser"
          >
            Open ↗
          </button>
        ) : null}
      </div>

      <div className="right-panel-scroll">
        <article className="article-content">
          <h1>{title}</h1>
          <div className="article-meta">
            {author ? <span>By {author} · </span> : null}
            {published ? <span>{formatDate(published)}</span> : null}
          </div>

          {hasContent ? (
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(contentHtml || summary || ""),
              }}
            />
          ) : (
            <p>No content available.</p>
          )}
        </article>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "");
}
