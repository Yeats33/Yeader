import { useCallback, useEffect, useState } from "react";
import { listYeaderSources } from "../api.ts";
import type { YeaderSource } from "../types.ts";

export function useYeaderSources() {
  const [sources, setSources] = useState<YeaderSource[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSources(await listYeaderSources());
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listYeaderSources()
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

  return { sources, loading, refresh };
}
