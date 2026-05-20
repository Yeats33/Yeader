import { useCallback, useEffect, useState } from "react";
import {
  listRssSources,
  saveRssSource,
  deleteRssSource,
  updateRssSourceMetadata,
  probeFeed,
  fetchFeed,
} from "../api.ts";
import type { LegacyRssSource, FeedSource, FeedItem } from "../types.ts";

export interface RssSourceWithItems extends LegacyRssSource {
  items?: FeedItem[];
  lastFetched?: string;
  itemCount?: number;
}

/**
 * @deprecated Unused legacy RSS hook from the pre-/feed implementation.
 * Useful pieces to preserve: saveRssSource, deleteRssSource, and
 * updateRssSourceMetadata after fetch. Prefer wiring those into /feed instead
 * of adding new callers here.
 */
export function useRssSources() {
  const [sources, setSources] = useState<RssSourceWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rssSources = await listRssSources();
      setSources(rssSources);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listRssSources()
      .then((loadedSources) => {
        if (!cancelled) setSources(loadedSources);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const addSource = useCallback(async (url: string): Promise<FeedSource | null> => {
    try {
      const probed = await probeFeed(url);
      const saved = await saveRssSource(probed);
      await refresh();
      return saved;
    } catch {
      return null;
    }
  }, [refresh]);

  const removeSource = useCallback(async (url: string): Promise<boolean> => {
    try {
      const result = await deleteRssSource(url);
      if (result) {
        setSources((prev) => prev.filter((s) => s.sourceUrl !== url));
      }
      return result;
    } catch {
      return false;
    }
  }, []);

  const toggleSource = useCallback(async (_url: string, _enabled: boolean): Promise<boolean> => {
    try {
      // Reload all sources after toggle
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const fetchSourceItems = useCallback(async (url: string): Promise<FeedItem[]> => {
    try {
      const items = await fetchFeed(url);
      // Update metadata
      await updateRssSourceMetadata(url, items.length, new Date().toISOString());
      // Update source with item count
      setSources((prev) =>
        prev.map((s) =>
          s.sourceUrl === url
            ? { ...s, itemCount: items.length, lastFetched: new Date().toISOString() }
            : s
        )
      );
      return items;
    } catch {
      return [];
    }
  }, []);

  return { sources, loading, refresh, addSource, removeSource, toggleSource, fetchSourceItems };
}
