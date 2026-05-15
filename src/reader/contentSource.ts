import type { Chapter, BookInfo } from "../types.ts";

export interface ChapterContent {
  title: string;
  content: string;
  images: string[];
  prevChapter?: string;
  nextChapter?: string;
}

export interface TableOfContents {
  chapters: Chapter[];
  bookInfo?: BookInfo;
}

export interface BookSearchResult {
  source_id: string;
  name: string;
  author: string;
  book_url: string;
  cover_url?: string;
  intro?: string;
  kind?: string;
  last_chapter?: string;
}

export interface ContentSource {
  name: string;
  loadChapter(bookId: string, chapterId: string): Promise<ChapterContent>;
  loadToc(bookId: string): Promise<TableOfContents>;
  search(keyword: string): Promise<BookSearchResult[]>;
}

export function resolveImagePaths(
  html: string,
  basePath: string,
  resolveFn: (url: string, basePath: string) => string,
): string {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  return html.replace(imgRegex, (_match, src) => {
    const resolved = resolveFn(src.trim(), basePath);
    return `<img src="${resolved}" loading="lazy" />`;
  });
}

export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}