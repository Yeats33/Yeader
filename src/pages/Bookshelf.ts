import { listBooks, removeBook, importEpub, deleteLocalEpub } from "../api.ts";
import { navigate } from "../router.ts";
import type { Book } from "../types.ts";
import { ask } from "@tauri-apps/plugin-dialog";

export type BookViewMode = "grid" | "list";

export function describeBookshelfEmpty(): string {
  return `
    <div class="page page-bookshelf">
      <header class="page-header">
        <h1>书架</h1>
      </header>
      <div class="empty-state">
        <p>书架为空</p>
        <button class="btn-primary" data-nav="/search">去搜索书籍</button>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function describeBookCard(book: Book): string {
  const progress = book.reading_progress ?? 0;
  const total = book.total_chapters ?? 0;
  const progressText =
    progress === 0
      ? "待阅读"
      : total > 0
        ? `阅读至第 ${progress} 章`
        : `阅读 ${progress}%`;

  const name = escapeHtml(book.name);
  const author = escapeHtml(book.author);

  const coverHtml = book.cover_url
    ? `<img src="${escapeHtml(book.cover_url)}" alt="${name}" loading="lazy" />`
    : `<div class="book-cover-placeholder"><span>${name.charAt(0)}</span></div>`;

  const url = escapeHtml(book.url);

  return `
    <li class="book-card" data-book-url="${url}" data-book-name="${name}" data-book-author="${author}" tabindex="0" role="button">
      <div class="book-cover">
        ${coverHtml}
      </div>
      <div class="book-info">
        <h3 class="book-title">${name}</h3>
        <p class="book-author">${author}</p>
        <p class="book-progress">${progressText}</p>
      </div>
      <button class="book-delete-btn" data-delete-book="${url}" title="删除">&#x2715;</button>
    </li>
  `;
}

function describeBookListItem(book: Book): string {
  const progress = book.reading_progress ?? 0;
  const total = book.total_chapters ?? 0;
  const progressText =
    progress === 0
      ? "待阅读"
      : total > 0
        ? `阅读至第 ${progress} 章`
        : `阅读 ${progress}%`;

  const name = escapeHtml(book.name);
  const author = escapeHtml(book.author);

  const coverHtml = book.cover_url
    ? `<img src="${escapeHtml(book.cover_url)}" alt="${name}" loading="lazy" class="list-cover-img" />`
    : `<div class="list-cover-placeholder"><span>${name.charAt(0)}</span></div>`;

  const url = escapeHtml(book.url);

  return `
    <li class="book-list-item" data-book-url="${url}" data-book-name="${name}" data-book-author="${author}" tabindex="0" role="button">
      <div class="list-cover">${coverHtml}</div>
      <div class="list-info">
        <h3 class="list-title">${name}</h3>
        <p class="list-author">${author}</p>
        <p class="list-progress">${progressText}</p>
      </div>
      <button class="book-delete-btn" data-delete-book="${url}" title="删除">&#x2715;</button>
    </li>
  `;
}

export function describeBookCards(books: Book[], viewMode: BookViewMode): string {
  const cards = books.map((book) =>
    viewMode === "grid" ? describeBookCard(book) : describeBookListItem(book)
  ).join("");

  return viewMode === "grid"
    ? `<ul class="book-grid">${cards}</ul>`
    : `<ul class="book-list">${cards}</ul>`;
}

export async function renderBookshelfPage(): Promise<string> {
  let books: Book[] = [];
  try {
    books = await listBooks();
  } catch {
    books = [];
  }

  // Separate local epubs
  const localBooks = books.filter(b => b.source_url === "local://epub");
  const networkBooks = books.filter(b => b.source_url !== "local://epub");

  return `
    <div class="page page-bookshelf" data-view-mode="grid" data-filter="all">
      <header class="page-header">
        <h1>书架</h1>
        <div class="view-toggle">
          <button class="btn-toggle active" data-view="grid" title="网格视图">&#x1F5BC;</button>
          <button class="btn-toggle" data-view="list" title="列表视图">&#x2630;</button>
        </div>
        <button class="btn-icon" data-nav="/search" title="搜索">&#x1F50D;</button>
        <button class="btn-icon" data-nav="/settings" title="设置">&#x2699;</button>
      </header>

      <div class="shelf-tabs">
        <button class="tab-btn active" data-filter="all">全部 (${books.length})</button>
        <button class="tab-btn" data-filter="local">本地书籍 (${localBooks.length})</button>
        <button class="tab-btn" data-filter="network">网络书籍 (${networkBooks.length})</button>
      </div>

      <button class="btn-primary" id="import-epub-btn" title="导入EPUB">+ 导入EPUB</button>

      ${books.length === 0 ? `
        <div class="empty-state">
          <p>书架为空</p>
          <button class="btn-primary" data-nav="/search">去搜索书籍</button>
        </div>
      ` : `
        <div id="book-container" data-view="grid">
          ${describeBookCards(books, "grid")}
        </div>
      `}
    </div>
  `;
}

export function initBookshelfHandlers(container: HTMLElement) {
  // View toggle
  const viewBtns = container.querySelectorAll<HTMLButtonElement>("[data-view]");
  const bookContainer = container.querySelector<HTMLElement>("#book-container");
  const pageEl = container.querySelector<HTMLElement>(".page-bookshelf");

  viewBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.view as BookViewMode;
      if (!pageEl || !bookContainer) return;

      viewBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const books = await listBooks().catch(() => [] as Book[]);
      bookContainer.innerHTML = describeBookCards(books, mode);
      pageEl.dataset["viewMode"] = mode;

      // Re-attach handlers
      attachBookHandlers(container);
      attachDeleteHandlers(container);
    });
  });

  // Tab filtering
  const tabBtns = container.querySelectorAll<HTMLButtonElement>(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filter = btn.dataset.filter!;
      const pageEl = container.querySelector<HTMLElement>(".page-bookshelf");
      if (pageEl) pageEl.dataset.filter = filter;

      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const allBooks = await listBooks().catch(() => [] as Book[]);
      let filteredBooks = allBooks;
      if (filter === "local") {
        filteredBooks = allBooks.filter(b => b.source_url === "local://epub");
      } else if (filter === "network") {
        filteredBooks = allBooks.filter(b => b.source_url !== "local://epub");
      }

      const bookContainer = container.querySelector<HTMLElement>("#book-container");
      if (bookContainer) {
        bookContainer.innerHTML = describeBookCards(filteredBooks, "grid");
      }

      attachBookHandlers(container);
      attachDeleteHandlers(container);
    });
  });

  // EPUB Import
  const importBtn = container.querySelector<HTMLButtonElement>("#import-epub-btn");
  importBtn?.addEventListener("click", async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (selected) {
        const book = await importEpub(selected as string);
        alert(`导入成功: ${book.name}`);
        window.location.reload();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`导入失败: ${msg}`);
    }
  });

  attachBookHandlers(container);
  attachDeleteHandlers(container);

  // Nav handlers
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const path = el.dataset.nav!;
      navigate(path);
    });
  });
}

function attachBookHandlers(container: HTMLElement) {
  const selectors = "[data-book-url]";
  container.querySelectorAll<HTMLElement>(selectors).forEach((el) => {
    el.addEventListener("click", (e) => {
      // Don't navigate if clicking on delete button
      const target = e.target as HTMLElement;
      if (target.closest("[data-delete-book]")) {
        return;
      }
      const bookUrl = el.dataset.bookUrl!;
      navigate(`/reader/${encodeURIComponent(bookUrl)}`);
    });
    el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        const bookUrl = el.dataset.bookUrl!;
        navigate(`/reader/${encodeURIComponent(bookUrl)}`);
      }
    });
  });
}

function attachDeleteHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>("[data-delete-book]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (btn.disabled) return;
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = "⏳";

      const bookUrl = btn.dataset.deleteBook!;
      const bookItem = btn.closest<HTMLElement>("[data-book-url]");
      const bookName = bookItem?.dataset.bookName || "此书";
      const isLocal = bookUrl.startsWith("local://epub/");

      try {
        const userConfirmed = await ask(`确定要从书架删除《${bookName}》吗？`, {
          title: "确认删除",
          kind: "warning",
          okLabel: "删除",
          cancelLabel: "取消"
        });

        if (!userConfirmed) {
          btn.disabled = false;
          btn.innerHTML = originalText;
          return;
        }

        let success = false;
        if (isLocal) {
          success = await deleteLocalEpub(bookUrl);
        } else {
          success = await removeBook(bookUrl);
        }

        if (success) {
          bookItem?.remove();
        } else {
          alert("删除失败");
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`删除失败：${msg}`);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  });
}
