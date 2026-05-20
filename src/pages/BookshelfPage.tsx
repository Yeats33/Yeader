import { useEffect, useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { deleteLocalEpub, importEpub, importEpubUrl, listBooks, removeBook } from "../api.ts";
import { navigate } from "../router.ts";
import type { Book } from "../types.ts";
import type { BookViewMode } from "./Bookshelf.ts";

type BookshelfFilter = "all" | "local" | "network";

function getProgressText(book: Book): string {
  const progress = book.reading_progress ?? 0;
  const chapterTitle = book.reading_chapter ? ` · ${book.reading_chapter}` : "";
  if (progress === 0) {
    return "待阅读";
  }
  return `阅读至第 ${progress} 章${chapterTitle}`;
}

function BookCover({ book, list = false }: { book: Book; list?: boolean }) {
  if (book.cover_url) {
    return (
      <img
        src={book.cover_url}
        alt={book.name}
        loading="lazy"
        className={list ? "list-cover-img" : undefined}
      />
    );
  }

  const className = list ? "list-cover-placeholder" : "book-cover-placeholder";
  return (
    <div className={className}>
      <span>{book.name.charAt(0)}</span>
    </div>
  );
}

function BookEntry({
  book,
  viewMode,
  onDelete,
}: {
  book: Book;
  viewMode: BookViewMode;
  onDelete: (book: Book) => void;
}) {
  const openBook = () => navigate(`/reader/${encodeURIComponent(book.url)}`);
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBook();
    }
  };

  if (viewMode === "list") {
    return (
      <li className="book-list-item" data-book-url={book.url} tabIndex={0} role="button" onClick={openBook} onKeyDown={onKeyDown}>
        <div className="list-cover"><BookCover book={book} list /></div>
        <div className="list-info">
          <h3 className="list-title">{book.name}</h3>
          <p className="list-author">{book.author}</p>
          <p className="list-progress">{getProgressText(book)}</p>
        </div>
        <button
          className="book-delete-btn"
          type="button"
          title="删除"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(book);
          }}
        >
          &#x2715;
        </button>
      </li>
    );
  }

  return (
    <li className="book-card" data-book-url={book.url} tabIndex={0} role="button" onClick={openBook} onKeyDown={onKeyDown}>
      <div className="book-cover"><BookCover book={book} /></div>
      <div className="book-info">
        <h3 className="book-title">{book.name}</h3>
        <p className="book-author">{book.author}</p>
        <p className="book-progress">{getProgressText(book)}</p>
      </div>
      <button
        className="book-delete-btn"
        type="button"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(book);
        }}
      >
        &#x2715;
      </button>
    </li>
  );
}

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
  const networkBooks = useMemo(() => books.filter((book) => book.source_url !== "local://epub"), [books]);
  const visibleBooks = filter === "local" ? localBooks : filter === "network" ? networkBooks : books;

  async function deleteBook(book: Book) {
    if (deletingUrl) return;
    setDeletingUrl(book.url);
    try {
      const confirmed = await ask(`确定要从书架删除《${book.name}》吗？`, {
        title: "确认删除",
        kind: "warning",
        okLabel: "删除",
        cancelLabel: "取消",
      });
      if (!confirmed) return;

      const success = book.url.startsWith("local://epub/")
        ? await deleteLocalEpub(book.url)
        : await removeBook(book.url);
      if (success) {
        setBooks((current) => current.filter((candidate) => candidate.url !== book.url));
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
        <h1>书架</h1>
        <div className="view-toggle">
          <button className={`btn-toggle ${viewMode === "grid" ? "active" : ""}`} type="button" onClick={() => setViewMode("grid")} title="网格视图">&#x1F5BC;</button>
          <button className={`btn-toggle ${viewMode === "list" ? "active" : ""}`} type="button" onClick={() => setViewMode("list")} title="列表视图">&#x2630;</button>
        </div>
        <button className="btn-icon" type="button" onClick={() => navigate("/search")} title="搜索">&#x1F50D;</button>
        <button className="btn-icon" type="button" onClick={() => navigate("/settings")} title="设置">&#x2699;</button>
      </header>

      <div className="shelf-tabs">
        <button className={`tab-btn ${filter === "all" ? "active" : ""}`} type="button" onClick={() => setFilter("all")}>全部 ({books.length})</button>
        <button className={`tab-btn ${filter === "local" ? "active" : ""}`} type="button" onClick={() => setFilter("local")}>本地书籍 ({localBooks.length})</button>
        <button className={`tab-btn ${filter === "network" ? "active" : ""}`} type="button" onClick={() => setFilter("network")}>网络书籍 ({networkBooks.length})</button>
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
          <p>书架为空</p>
          <button className="btn-primary" type="button" onClick={() => navigate("/search")}>去搜索书籍</button>
        </div>
      ) : null}
      {!loading && books.length > 0 ? (
        <div id="book-container" data-view={viewMode}>
          {viewMode === "grid" ? (
            <ul className="book-grid">
              {visibleBooks.map((book) => <BookEntry book={book} viewMode={viewMode} onDelete={deleteBook} key={book.url} />)}
            </ul>
          ) : (
            <ul className="book-list">
              {visibleBooks.map((book) => <BookEntry book={book} viewMode={viewMode} onDelete={deleteBook} key={book.url} />)}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
