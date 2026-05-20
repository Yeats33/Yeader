import { useState, useEffect, useCallback } from "react";
import { fetchFeed, listRssSources, listBookSources } from "../api.ts";
import type { FeedSource, FeedItem, LegacyBookSource, LegacyRssSource } from "../types.ts";
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

// Convert LegacyBookSource to FeedSource for display
function bookToFeedSource(book: LegacyBookSource): FeedSource {
  return {
    id: `book:${book.bookSourceUrl}`,
    url: book.bookSourceUrl,
    title: book.bookSourceName || "Book Source",
    description: book.bookSourceComment,
    link: undefined,
    iconUrl: undefined,
    mediaType: "novel",
    folder: book.bookSourceGroup ?? undefined,
    enabled: book.enabledExplore ?? true,
    defaultView: undefined,
  };
}

export function ThreePanelLayout() {
  const [sources, setSources] = useState<FeedSource[]>([]);
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
        const [rssSources, bookSources] = await Promise.all([
          listRssSources(),
          listBookSources(),
        ]);
        const rssFeeds = rssSources.map(rssToFeedSource);
        const bookFeeds = bookSources.map(bookToFeedSource);
        // Merge and deduplicate by URL
        const allSources = [...rssFeeds, ...bookFeeds];
        setSources(allSources);
      } catch {
        setSources([]);
      }
    }
    loadAllSources();
  }, []);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const handleSelectSource = useCallback(
    async (id: string) => {
      setSelectedSourceId(id);
      setSelectedItemId(null);

      // Resolve view for this source
      if (id === "all" || id === "starred") {
        setCurrentViewType("article");
        setItems([]);
        return;
      }

      const source = sources.find((s) => s.id === id);
      if (!source) return;

      // Determine view: subscription override → source default → mediaType fallback
      const sourceDefaultView = source.defaultView as ViewType | undefined;
      const mediaType = source.mediaType as YeaderMediaType;
      setCurrentViewType(resolveView(null, sourceDefaultView ?? null, mediaType));

      setLoading(true);
      try {
        const feedItems = await fetchFeed(source.url);
        setItems(feedItems);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [sources],
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
        sourceName={selectedSource?.title ?? null}
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
