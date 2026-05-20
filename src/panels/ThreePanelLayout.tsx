import { useState, useEffect, useCallback } from "react";
import { fetchFeed } from "../api.ts";
import type { FeedSource, FeedItem } from "../types.ts";
import type { ViewType, YeaderMediaType } from "../views/types.ts";
import { resolveView } from "../views/types.ts";
import { LeftPanel } from "./LeftPanel.tsx";
import { MiddlePanel } from "./MiddlePanel.tsx";
import { RightPanel } from "./RightPanel.tsx";
import { AddSourceModal } from "../components/AddSourceModal.tsx";

const STORAGE_KEY = "yeader_feed_sources";

function loadSources(): FeedSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSources(sources: FeedSource[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export function ThreePanelLayout() {
  const [sources, setSources] = useState<FeedSource[]>(loadSources);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentViewType, setCurrentViewType] = useState<ViewType>("article");

  useEffect(() => {
    saveSources(sources);
  }, [sources]);

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
