interface BookshelfViewProps {
  item: Record<string, unknown> | null;
}

export function BookshelfView({ item }: BookshelfViewProps) {
  if (!item) {
    return (
      <main className="right-panel">
        <div className="right-panel-empty">Select a folder to browse</div>
      </main>
    );
  }

  const title = (item.title as string) ?? "Bookshelf";
  const items = (item.items as Array<Record<string, unknown>>) ?? [];

  return (
    <main className="right-panel">
      <div className="right-panel-header">
        <h2>{title}</h2>
        <span className="item-count">{items.length} items</span>
      </div>

      <div className="right-panel-scroll">
        <div className="bookshelf-grid">
          {items.length === 0 ? (
            <div className="bookshelf-empty">Empty folder</div>
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
