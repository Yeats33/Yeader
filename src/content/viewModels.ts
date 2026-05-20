import type { Book, SearchResult, YeaderSource } from "../types.ts";

export type ContentKind = "local-file" | "web-content" | "rss" | "rule-source" | "plugin" | "generic";

export interface LibraryItem {
  id: string;
  title: string;
  creator: string;
  thumbnailUrl?: string;
  sourceId: string;
  kind: ContentKind;
  progressLabel: string;
  raw: Book;
}

export interface ContentResult {
  id: string;
  title: string;
  creator: string;
  url: string;
  sourceId: string;
  thumbnailUrl?: string;
  summary?: string;
  category?: string;
  latestEntry?: string;
  raw: SearchResult;
}

export interface ContentSource {
  id: string;
  name: string;
  kind: ContentKind;
  enabled: boolean;
  capabilityLabels: string[];
  homepage?: string;
  publisher?: string;
  raw: YeaderSource;
}

export type SourceKindFilter = "all" | "rss" | "rule-source" | "plugin";

const capabilityLabels: Record<string, string> = {
  search: "搜索",
  detail: "详情",
  toc: "目录",
  content: "正文",
  feed: "订阅",
  list: "列表",
  asset: "资源",
};

function progressLabel(book: Book): string {
  const progress = book.reading_progress ?? 0;
  const entryTitle = book.reading_chapter ? ` · ${book.reading_chapter}` : "";
  if (progress === 0) {
    return "待阅读";
  }
  return `阅读至第 ${progress} 项${entryTitle}`;
}

export function libraryItemFromBook(book: Book): LibraryItem {
  return {
    id: book.url,
    title: book.name,
    creator: book.author,
    thumbnailUrl: book.cover_url,
    sourceId: book.source_url,
    kind: book.source_url === "local://epub" ? "local-file" : "web-content",
    progressLabel: progressLabel(book),
    raw: book,
  };
}

export function contentResultFromSearchResult(result: SearchResult): ContentResult {
  return {
    id: `${result.source_id}|${result.book_url}`,
    title: result.name,
    creator: result.author,
    url: result.book_url,
    sourceId: result.source_id,
    thumbnailUrl: result.cover_url,
    summary: result.intro,
    category: result.kind,
    latestEntry: result.last_chapter,
    raw: result,
  };
}

export function contentSourceFromYeaderSource(source: YeaderSource): ContentSource {
  return {
    id: source.id,
    name: source.name,
    kind: source.mediaType === "rss" ? "rss" : "rule-source",
    enabled: source.enabled !== false,
    capabilityLabels: (source.capabilities ?? []).map((capability) => capabilityLabels[capability.kind] ?? capability.kind),
    homepage: source.homepage,
    publisher: source.publisher,
    raw: source,
  };
}

export function sourceKindLabel(kind: ContentKind | SourceKindFilter): string {
  if (kind === "rss") return "RSS";
  if (kind === "rule-source") return "规则";
  if (kind === "plugin") return "插件";
  if (kind === "local-file") return "本地文件";
  if (kind === "web-content") return "网站内容";
  return "通用";
}

export function filterContentSources(sources: ContentSource[], filter: SourceKindFilter): ContentSource[] {
  if (filter === "all") {
    return sources;
  }
  if (filter === "plugin") {
    return [];
  }
  return sources.filter((source) => source.kind === filter);
}
