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
  const chapterTitle = book.reading_chapter ? ` · ${escapeHtml(book.reading_chapter)}` : "";
  const progressText =
    progress === 0
      ? "待阅读"
      : total > 0
        ? `阅读至第 ${progress} 章${chapterTitle}`
        : `阅读至第 ${progress} 章${chapterTitle}`;

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
  const chapterTitle = book.reading_chapter ? ` · ${escapeHtml(book.reading_chapter)}` : "";
  const progressText =
    progress === 0
      ? "待阅读"
      : total > 0
        ? `阅读至第 ${progress} 章${chapterTitle}`
        : `阅读至第 ${progress} 章${chapterTitle}`;

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
