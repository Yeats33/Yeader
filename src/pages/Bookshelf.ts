import { listBooks } from "../api.ts";
import { navigate } from "../router.ts";
import type { Book } from "../types.ts";

export async function renderBookshelfPage(): Promise<string> {
  let books: Book[] = [];
  try {
    books = await listBooks();
  } catch {
    books = [];
  }

  if (books.length === 0) {
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

  const bookCards = books
    .map((book) => {
      const progress = book.reading_progress ?? 0;
      const total = book.total_chapters ?? 0;
      const progressText =
        progress === 0
          ? "待阅读"
          : total > 0
            ? `阅读至第 ${progress} 章`
            : `阅读 ${progress}%`;

      return `
        <li class="book-card" data-book-url="${book.url}" tabindex="0" role="button">
          <div class="book-cover">
            ${book.cover_url ? `<img src="${book.cover_url}" alt="${book.name}" loading="lazy" />` : `<div class="book-cover-placeholder"><span>${book.name.charAt(0)}</span></div>`}
          </div>
          <div class="book-info">
            <h3 class="book-title">${book.name}</h3>
            <p class="book-author">${book.author}</p>
            <p class="book-progress">${progressText}</p>
          </div>
        </li>
      `;
    })
    .join("");

  return `
    <div class="page page-bookshelf">
      <header class="page-header">
        <h1>书架</h1>
        <button class="btn-icon" data-nav="/search" title="搜索">&#x1F50D;</button>
      </header>
      <ul class="book-grid">${bookCards}</ul>
    </div>
  `;
}

export function initBookshelfHandlers(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-book-url]").forEach((el) => {
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

  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const path = el.dataset.nav!;
      navigate(path);
    });
  });
}
