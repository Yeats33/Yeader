interface BookshelfViewProps {
  item: Record<string, unknown> | null;
}

/**
 * @deprecated Prototype plugin view for folder-style book collections.
 * Current book subscription rendering is handled directly in /feed RightPanel.
 * Keep only if the plugin view registry grows real bookshelf-shaped items.
 */
export function BookshelfView({ item }: BookshelfViewProps) {
  if (!item) {
    return (
      <main className="right-panel">
        <div className="right-panel-empty">选择一个书籍分组</div>
      </main>
    );
  }

  const title = (item.title as string) ?? "书架";
  const items = (item.items as Array<Record<string, unknown>>) ?? [];

  return (
    <main className="right-panel">
      <div className="right-panel-header">
        <h2>{title}</h2>
        <span className="item-count">{items.length} 项</span>
      </div>

      <div className="right-panel-scroll">
        <div className="bookshelf-grid">
          {items.length === 0 ? (
            <div className="bookshelf-empty">暂无内容</div>
          ) : (
            items.map((entry) => {
              const entryTitle = (entry.title as string) ?? (entry.name as string) ?? "";
              const coverUrl = (entry.coverUrl as string) ?? (entry.imageUrl as string) ?? "";
              const entryAuthor = (entry.author as string) ?? "";
              const id = (entry.id as string) ?? entryTitle;

              return (
                <div className="bookshelf-card" key={id}>
                  {coverUrl ? (
                    <img className="bookshelf-cover" src={coverUrl} alt={entryTitle} loading="lazy" />
                  ) : (
                    <div className="bookshelf-cover-placeholder">{entryTitle.charAt(0)}</div>
                  )}
                  <div className="bookshelf-card-title">{entryTitle}</div>
                  {entryAuthor ? <div className="bookshelf-card-author">{entryAuthor}</div> : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
