import { navigate } from "../../router.ts";
import { fetchBookInfo, fetchToc, addBookToShelf } from "../../api.ts";
import type { BookInfo, Chapter } from "../../types.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface OnlineReaderState {
  bookInfo: BookInfo | null;
  chapters: Chapter[];
  sourceUrl: string;
}

export function renderOnlineReaderPage(): string {

  return `
    <div class="page page-online-reader">
      <header class="page-header">
        <button class="btn-icon" data-nav="/search" title="返回">&#x2190;</button>
        <h1 id="online-book-title">加载中...</h1>
      </header>

      <div id="online-book-info" class="online-book-info">
        <div class="loading">加载书籍信息...</div>
      </div>

      <div id="online-toc" class="online-toc">
        <div class="loading">加载目录...</div>
      </div>
    </div>
  `;
}

export async function initOnlineReader(
  container: HTMLElement,
  bookUrl: string,
  sourceUrl: string,
): Promise<void> {
  const titleEl = container.querySelector<HTMLElement>("#online-book-title");
  const infoEl = container.querySelector<HTMLElement>("#online-book-info");
  const tocEl = container.querySelector<HTMLElement>("#online-toc");

  try {
    const bookInfo = await fetchBookInfo(bookUrl, sourceUrl);

    if (titleEl) titleEl.textContent = bookInfo.name;
    if (infoEl) {
      infoEl.innerHTML = `
        <div class="book-info-card">
          ${bookInfo.cover_url ? `<img src="${escapeHtml(bookInfo.cover_url)}" alt="${escapeHtml(bookInfo.name)}" class="book-cover" />` : ""}
          <div class="book-meta">
            <h2>${escapeHtml(bookInfo.name)}</h2>
            <p class="book-author">${escapeHtml(bookInfo.author)}</p>
            ${bookInfo.kind ? `<p class="book-kind">${escapeHtml(bookInfo.kind)}</p>` : ""}
            ${bookInfo.intro ? `<p class="book-intro">${escapeHtml(bookInfo.intro)}</p>` : ""}
            ${bookInfo.last_chapter ? `<p class="book-last-chapter">最新: ${escapeHtml(bookInfo.last_chapter)}</p>` : ""}
          </div>
        </div>
        <button class="btn-primary" id="add-to-shelf-btn">加入书架</button>
      `;
    }

    const chapters = bookInfo.toc_url
      ? await fetchToc(bookInfo.toc_url, sourceUrl)
      : [];

    if (tocEl) {
      if (chapters.length === 0) {
        tocEl.innerHTML = '<p class="muted-text">暂无目录</p>';
      } else {
        tocEl.innerHTML = `
          <h3>目录</h3>
          <ul class="toc-list">
            ${chapters
              .map(
                (ch) => `
              <li class="toc-item" data-chapter-url="${escapeHtml(ch.url)}" data-source-url="${escapeHtml(sourceUrl)}">
                <span class="toc-title">${escapeHtml(ch.title)}</span>
                ${ch.is_vip ? '<span class="vip-badge">VIP</span>' : ""}
                ${ch.is_volume ? '<span class="volume-badge">卷</span>' : ""}
              </li>
            `,
              )
              .join("")}
          </ul>
        `;
      }
    }

    container.querySelector<HTMLButtonElement>("#add-to-shelf-btn")?.addEventListener("click", async () => {
      await addBookToShelf({
        url: bookUrl,
        name: bookInfo.name,
        author: bookInfo.author,
        source_url: sourceUrl,
        cover_url: bookInfo.cover_url,
        toc_url: bookInfo.toc_url,
        intro: bookInfo.intro,
      });
      navigate("/");
    });

    tocEl?.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
      el.addEventListener("click", () => {
        const chapterUrl = el.dataset.chapterUrl!;
        const srcUrl = el.dataset.sourceUrl!;
        navigate(`/online-reader/${encodeURIComponent(bookUrl)}/${encodeURIComponent(srcUrl)}/chapter/${encodeURIComponent(chapterUrl)}`);
      });
    });
  } catch (e) {
    if (infoEl) {
      infoEl.innerHTML = `<div class="error-msg">加载失败: ${e instanceof Error ? e.message : String(e)}</div>`;
    }
  }

  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });
}