import { useState, useEffect, useCallback } from "react";
import { fetchFeed, listRssSources, listBooks, listYeaderSources } from "../api.ts";
import type { Book, FeedSource, FeedItem, LegacyRssSource, YeaderSource } from "../types.ts";
import type { ViewType, YeaderMediaType } from "../views/types.ts";
import { resolveView } from "../views/types.ts";
import { LeftPanel } from "./LeftPanel.tsx";
import { MiddlePanel } from "./MiddlePanel.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { AddSourceModal } from "../components/AddSourceModal.tsx";

// Convert LegacyRssSource to FeedSource for display
function rssToFeedSource(rss: LegacyRssSource): FeedSource {
  return {
    id: `rss:${rss.sourceUrl}`,
    url: rss.sourceUrl,
    title: rss.sourceName || "RSS Source",
    description: undefined,
    link: undefined,
    iconUrl: rss.sourceIcon,
    mediaType: "rss",
    folder: (rss.extra as Record<string, unknown>)?.folder as string | undefined ?? undefined,
    enabled: rss.enabled,
    defaultView: undefined,
  };
}

function bookSourcePanelId(sourceUrl: string): string {
  return `book-source:${sourceUrl}`;
}

function bookToFeedItem(book: Book): FeedItem {
  const progress = book.reading_progress ?? 0;
  const progressLabel = progress > 0
    ? `阅读至第 ${progress} 项${book.reading_chapter ? ` · ${book.reading_chapter}` : ""}`
    : "待阅读";

  return {
    id: `book:${book.url}`,
    sourceId: bookSourcePanelId(book.source_url),
    title: book.name,
    url: book.url,
    author: book.author,
    updated: book.last_read_at,
    summary: book.intro,
    imageUrl: book.cover_url,
    mediaType: "novel",
    bookSourceUrl: book.source_url,
    latestEntry: book.reading_chapter,
    progressLabel,
    read: false,
  };
}

function bookSourceTitle(sourceUrl: string, yeaderSources: YeaderSource[]): string {
  return yeaderSources.find((source) => source.id === sourceUrl)?.name
    ?? (sourceUrl === "local://epub" ? "本地 EPUB" : sourceUrl);
}

function bookSourcesFromBooks(books: Book[], yeaderSources: YeaderSource[]): FeedSource[] {
  const seen = new Set<string>();
  const sources: FeedSource[] = [];

  for (const book of books) {
    if (seen.has(book.source_url)) continue;
    seen.add(book.source_url);
    const source = yeaderSources.find((entry) => entry.id === book.source_url);
    sources.push({
      id: bookSourcePanelId(book.source_url),
      url: book.source_url,
      title: bookSourceTitle(book.source_url, yeaderSources),
      description: source?.homepage,
      link: source?.homepage,
      mediaType: "novel",
      enabled: true,
      defaultView: "article",
    });
  }

  return sources;
}

export function ThreePanelLayout() {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [bookItems, setBookItems] = useState<FeedItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentViewType, setCurrentViewType] = useState<ViewType>("article");

  // Load sources from database on mount
  useEffect(() => {
    async function loadAllSources() {
      try {
        const [rssSources, books, yeaderSources] = await Promise.all([
          listRssSources(),
          listBooks(),
          listYeaderSources(),
        ]);
        const rssFeeds = rssSources.map(rssToFeedSource);
        const nextBookItems = books.map(bookToFeedItem);
        const bookFeeds = bookSourcesFromBooks(books, yeaderSources);
        setBookItems(nextBookItems);
        setSources([...bookFeeds, ...rssFeeds]);
      } catch {
        setSources([]);
        setBookItems([]);
      }
    }
    loadAllSources();
  }, []);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const selectedSourceName = selectedSource?.title
    ?? (selectedSourceId === "all" ? "全部订阅" : selectedSourceId === "starred" ? "收藏" : null);

  const handleSelectSource = useCallback(
    async (id: string) => {
      setSelectedSourceId(id);
      setSelectedItemId(null);
      setLoading(true);

      if (id === "all" || id === "starred") {
        setCurrentViewType("article");
        if (id === "starred") {
          setItems([]);
          setLoading(false);
          return;
        }

        const rssSources = sources.filter((source) => source.mediaType === "rss");
        const rssItemLists = await Promise.all(
          rssSources.map((source) => fetchFeed(source.url).catch(() => [] as FeedItem[])),
        );
        setItems([...bookItems, ...rssItemLists.flat()]);
        setLoading(false);
        return;
      }

      const source = sources.find((s) => s.id === id);
      if (!source) {
        setLoading(false);
        return;
      }

      const sourceDefaultView = source.defaultView as ViewType | undefined;
      const mediaType = source.mediaType as YeaderMediaType;
      setCurrentViewType(resolveView(null, sourceDefaultView ?? null, mediaType));

      if (source.mediaType === "novel") {
        setItems(bookItems.filter((item) => item.sourceId === source.id));
        setLoading(false);
        return;
      }

      try {
        const feedItems = await fetchFeed(source.url);
        setItems(feedItems);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [bookItems, sources],
  );

  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const handleAddSource = useCallback((source: FeedSource) => {
    setSources((prev) => {
      if (prev.some((s) => s.url === source.url)) return prev;
      return [...prev, source];
    });
    setShowAddModal(false);
  }, []);

  return (
    <div className="threepanel-layout">
      <LeftPanel
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSelectSource={handleSelectSource}
        onAddSource={() => setShowAddModal(true)}
      />
      <MiddlePanel
        items={items}
        selectedItemId={selectedItemId}
        sourceName={selectedSourceName}
        loading={loading}
        onSelectItem={handleSelectItem}
      />
      <RightPanel item={selectedItem} viewType={currentViewType} />
      {showAddModal ? (
        <AddSourceModal
          onAdd={handleAddSource}
          onClose={() => setShowAddModal(false)}
        />
      ) : null}
    </div>
  );
}
