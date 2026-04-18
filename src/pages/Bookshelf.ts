import { listBooks } from "../api.ts";
import { navigate } from "../router.ts";
import type { Book } from "../types.ts";

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
    <li class="book-card" data-book-url="${url}" tabindex="0" role="button">
      <div class="book-cover">
        ${coverHtml}
      </div>
      <div class="book-info">
        <h3 class="book-title">${name}</h3>
        <p class="book-author">${author}</p>
        <p class="book-progress">${progressText}</p>
      </div>
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
    <li class="book-list-item" data-book-url="${url}" tabindex="0" role="button">
      <div class="list-cover">${coverHtml}</div>
      <div class="list-info">
        <h3 class="list-title">${name}</h3>
        <p class="list-author">${author}</p>
        <p class="list-progress">${progressText}</p>
      </div>
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

  return `
    <div class="page page-bookshelf" data-view-mode="grid">
      <header class="page-header">
        <h1>书架</h1>
        <div class="view-toggle">
          <button class="btn-toggle active" data-view="grid" title="网格视图">&#x1F5BC;</button>
          <button class="btn-toggle" data-view="list" title="列表视图">&#x2630;</button>
        </div>
        <button class="btn-icon" data-nav="/search" title="搜索">&#x1F50D;</button>
      </header>
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

      // Re-attach book click handlers
      attachBookHandlers(container);
    });
  });

  attachBookHandlers(container);

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
    el.addEventListener("click", () => {
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
