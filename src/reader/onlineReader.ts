import type { BookSearchResult, TableOfContents, ChapterContent } from "./contentSource.ts";
import type { LegacyBookSource, BookInfo, Chapter } from "../types.ts";

export class BookSourceAdapter {
  private source: LegacyBookSource;

  constructor(source: LegacyBookSource) {
    this.source = source;
  }

  get name(): string {
    return this.source.bookSourceName;
  }

  async search(keyword: string): Promise<BookSearchResult[]> {
    if (!this.source.ruleSearch) {
      return [];
    }

    const { searchBooks } = await import("../api.ts");
    const results = await searchBooks(this.source.bookSourceUrl, keyword, 1);

    return results.map((r) => ({
      source_id: this.source.bookSourceUrl,
      name: r.name,
      author: r.author,
      book_url: r.book_url,
      cover_url: r.cover_url,
      intro: r.intro,
      kind: r.kind,
      last_chapter: r.last_chapter,
    }));
  }

  async loadToc(bookId: string): Promise<TableOfContents> {
    const { fetchBookInfo, fetchToc } = await import("../api.ts");

    let bookInfo: BookInfo;
    try {
      bookInfo = await fetchBookInfo(bookId, this.source.bookSourceUrl);
    } catch {
      bookInfo = { name: "未知书籍", author: "未知" };
    }

    let chapters: Chapter[] = [];
    if (bookInfo.toc_url) {
      try {
        chapters = await fetchToc(bookInfo.toc_url, this.source.bookSourceUrl);
      } catch {
        chapters = [];
      }
    }

    return { chapters, bookInfo };
  }

  async loadChapter(bookId: string, chapterId: string): Promise<ChapterContent> {
    const { fetchContent } = await import("../api.ts");

    const toc = await this.loadToc(bookId);
    const chapter = toc.chapters.find((ch) => ch.url === chapterId);
    if (!chapter) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }

    const content = await fetchContent(chapter.url, this.source.bookSourceUrl);

    const prevIndex = toc.chapters.findIndex((ch) => ch.url === chapterId) - 1;
    const nextIndex = toc.chapters.findIndex((ch) => ch.url === chapterId) + 1;

    return {
      title: chapter.title,
      content,
      images: [],
      prevChapter: prevIndex >= 0 ? toc.chapters[prevIndex].url : undefined,
      nextChapter: nextIndex < toc.chapters.length ? toc.chapters[nextIndex].url : undefined,
    };
  }
}

export async function createBookSourceAdapter(
  sourceUrl: string,
): Promise<BookSourceAdapter | null> {
  const { listBookSources } = await import("../api.ts");
  const sources = await listBookSources();
  const source = sources.find((s) => s.bookSourceUrl === sourceUrl);
  if (!source) return null;
  return new BookSourceAdapter(source);
}