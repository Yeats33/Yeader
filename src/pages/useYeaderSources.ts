import { useEffect, useState } from "react";
import { listYeaderSources } from "../api.ts";
import type { YeaderSource } from "../types.ts";

export function useYeaderSources() {
  const [sources, setSources] = useState<YeaderSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listYeaderSources()
      .then((loadedSources) => {
        if (!cancelled) {
          setSources(loadedSources);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSources([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { sources, loading };
}
