import { useEffect, useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { deleteLocalEpub, importEpub, importEpubUrl, listBooks, removeBook } from "../api.ts";
import { libraryItemFromBook, type LibraryItem } from "../content/viewModels.ts";
import { navigate } from "../router.ts";
import type { Book } from "../types.ts";

type BookViewMode = "grid" | "list";

type BookshelfFilter = "all" | "local" | "web";

/**
 * @deprecated Compatibility page for the old standalone reading library.
 * Keep this code until local EPUB import is replaced by the downloadable
 * Local EPUB plugin from YeaderHub. Do not add new subscription features here.
 */
function ItemThumbnail({ item, list = false }: { item: LibraryItem; list?: boolean }) {
  if (item.thumbnailUrl) {
    return (
      <img
        src={item.thumbnailUrl}
        alt={item.title}
        loading="lazy"
        className={list ? "list-cover-img" : undefined}
      />
    );
  }

  const className = list ? "list-cover-placeholder" : "book-cover-placeholder";
  return (
    <div className={className}>
      <span>{item.title.charAt(0)}</span>
    </div>
  );
}

function LibraryItemEntry({
  item,
  viewMode,
  onDelete,
}: {
  item: LibraryItem;
  viewMode: BookViewMode;
  onDelete: (item: LibraryItem) => void;
}) {
  const openItem = () => navigate(`/reader/${encodeURIComponent(item.id)}`);
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openItem();
    }
  };

  if (viewMode === "list") {
    return (
      <li className="book-list-item" data-book-url={item.id} tabIndex={0} role="button" onClick={openItem} onKeyDown={onKeyDown}>
        <div className="list-cover"><ItemThumbnail item={item} list /></div>
        <div className="list-info">
          <h3 className="list-title">{item.title}</h3>
          <p className="list-author">{item.creator}</p>
          <p className="list-progress">{item.progressLabel}</p>
        </div>
        <button
          className="book-delete-btn"
          type="button"
          title="删除"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item);
          }}
        >
          &#x2715;
        </button>
      </li>
    );
  }

  return (
    <li className="book-card" data-book-url={item.id} tabIndex={0} role="button" onClick={openItem} onKeyDown={onKeyDown}>
      <div className="book-cover"><ItemThumbnail item={item} /></div>
      <div className="book-info">
        <h3 className="book-title">{item.title}</h3>
        <p className="book-author">{item.creator}</p>
        <p className="book-progress">{item.progressLabel}</p>
      </div>
      <button
        className="book-delete-btn"
        type="button"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item);
        }}
      >
        &#x2715;
      </button>
    </li>
  );
}

/**
 * @deprecated Use /feed as the aggregate subscription and reading surface.
 * This page still contains useful EPUB import behavior that should inform the
 * YeaderHub Local EPUB plugin before the route is removed.
 */
export function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<BookViewMode>("grid");
  const [filter, setFilter] = useState<BookshelfFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  async function refreshBooks() {
    setLoading(true);
    try {
      setBooks(await listBooks());
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBooks();
  }, []);

  const localBooks = useMemo(() => books.filter((book) => book.source_url === "local://epub"), [books]);
  const webBooks = useMemo(() => books.filter((book) => book.source_url !== "local://epub"), [books]);
  const visibleBooks = filter === "local" ? localBooks : filter === "web" ? webBooks : books;
  const visibleItems = useMemo(() => visibleBooks.map(libraryItemFromBook), [visibleBooks]);

  async function deleteItem(item: LibraryItem) {
    if (deletingUrl) return;
    setDeletingUrl(item.id);
    try {
      const confirmed = await ask(`确定要从阅读库删除《${item.title}》吗？`, {
        title: "确认删除",
        kind: "warning",
        okLabel: "删除",
        cancelLabel: "取消",
      });
      if (!confirmed) return;

      const success = item.id.startsWith("local://epub/")
        ? await deleteLocalEpub(item.id)
        : await removeBook(item.id);
      if (success) {
        setBooks((current) => current.filter((candidate) => candidate.url !== item.id));
      } else {
        window.alert("删除失败");
      }
    } catch (e) {
      window.alert(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingUrl(null);
    }
  }

  async function runImport(action: "local" | "path" | "url") {
    setImportOpen(false);
    try {
      if (action === "local") {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [{ name: "EPUB", extensions: ["epub"] }],
        });
        if (!selected) return;
        const book = await importEpub(selected as string);
        window.alert(`导入成功: ${book.name}`);
      }

      if (action === "path") {
        const path = window.prompt("请输入 EPUB 文件路径：");
        if (!path?.trim()) return;
        const book = await importEpub(path.trim());
        window.alert(`导入成功: ${book.name}`);
      }

      if (action === "url") {
        const url = window.prompt("请输入 EPUB 下载 URL：");
        if (!url?.trim()) return;
        const book = await importEpubUrl(url.trim());
        window.alert(`导入成功: ${book.name}`);
      }

      await refreshBooks();
    } catch (e) {
      window.alert(`导入失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="page page-bookshelf" data-view-mode={viewMode} data-filter={filter}>
      <header className="page-header">
        <h1>阅读</h1>
        <div className="view-toggle">
          <button className={`btn-toggle ${viewMode === "grid" ? "active" : ""}`} type="button" onClick={() => setViewMode("grid")} title="网格视图">&#x1F5BC;</button>
          <button className={`btn-toggle ${viewMode === "list" ? "active" : ""}`} type="button" onClick={() => setViewMode("list")} title="列表视图">&#x2630;</button>
        </div>
        <button className="btn-icon" type="button" onClick={() => navigate("/discover")} title="发现">&#x1F50D;</button>
        <button className="btn-icon" type="button" onClick={() => navigate("/settings")} title="设置">&#x2699;</button>
      </header>

      <div className="shelf-tabs">
        <button className={`tab-btn ${filter === "all" ? "active" : ""}`} type="button" onClick={() => setFilter("all")}>全部 ({books.length})</button>
        <button className={`tab-btn ${filter === "local" ? "active" : ""}`} type="button" onClick={() => setFilter("local")}>本地文件 ({localBooks.length})</button>
        <button className={`tab-btn ${filter === "web" ? "active" : ""}`} type="button" onClick={() => setFilter("web")}>网站内容 ({webBooks.length})</button>
      </div>

      <div className="import-dropdown">
        <button className="btn-primary" type="button" onClick={() => setImportOpen((open) => !open)} title="导入EPUB">+ 导入</button>
        <div className={`dropdown-menu ${importOpen ? "" : "hidden"}`}>
          <button className="dropdown-item" type="button" onClick={() => void runImport("local")}>
            <span className="dropdown-icon">📁</span>导入本地 EPUB
          </button>
          <button className="dropdown-item" type="button" onClick={() => void runImport("path")}>
            <span className="dropdown-icon">🔗</span>输入路径
          </button>
          <button className="dropdown-item" type="button" onClick={() => void runImport("url")}>
            <span className="dropdown-icon">🌐</span>输入 URL
          </button>
        </div>
      </div>

      {loading ? <div className="loading">加载中...</div> : null}
      {!loading && books.length === 0 ? (
        <div className="empty-state">
          <p>内容库为空</p>
          <button className="btn-primary" type="button" onClick={() => navigate("/discover")}>添加内容</button>
        </div>
      ) : null}
      {!loading && books.length > 0 ? (
        <div id="book-container" data-view={viewMode}>
          {viewMode === "grid" ? (
            <ul className="book-grid">
              {visibleItems.map((item) => <LibraryItemEntry item={item} viewMode={viewMode} onDelete={deleteItem} key={item.id} />)}
            </ul>
          ) : (
            <ul className="book-list">
              {visibleItems.map((item) => <LibraryItemEntry item={item} viewMode={viewMode} onDelete={deleteItem} key={item.id} />)}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
