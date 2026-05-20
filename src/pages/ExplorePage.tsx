import { useEffect, useMemo, useState } from "react";
import { exploreBooks, listExploreCategories } from "../api.ts";
import { navigate } from "../router.ts";
import type {
  SearchResult,
  YeaderExploreCategory,
  YeaderExploreOrder,
  YeaderSource,
} from "../types.ts";

const UNCATEGORIZED_GROUP = "其他";

type GroupedCategories = ReadonlyArray<{
  group: string;
  items: ReadonlyArray<YeaderExploreCategory>;
}>;

function groupCategories(
  categories: ReadonlyArray<YeaderExploreCategory>,
): GroupedCategories {
  const groups = new Map<string, YeaderExploreCategory[]>();
  for (const category of categories) {
    const group = category.group ?? UNCATEGORIZED_GROUP;
    const bucket = groups.get(group);
    if (bucket) {
      bucket.push(category);
    } else {
      groups.set(group, [category]);
    }
  }
  return Array.from(groups, ([group, items]) => ({ group, items }));
}

function BookGridCard({ result }: { result: SearchResult }) {
  const target = `/online-reader/${encodeURIComponent(result.book_url)}/${encodeURIComponent(result.source_id)}`;
  return (
    <li
      className="explore-book-card"
      tabIndex={0}
      role="button"
      onClick={() => navigate(target)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(target);
        }
      }}
    >
      <div className="explore-book-cover">
        {result.cover_url ? (
          <img src={result.cover_url} alt={result.name} loading="lazy" />
        ) : (
          <div className="explore-book-cover-placeholder">
            <span>{result.name.charAt(0)}</span>
          </div>
        )}
        {result.kind ? <span className="explore-book-badge">{result.kind}</span> : null}
      </div>
      <div className="explore-book-info">
        <h3 className="explore-book-title" title={result.name}>{result.name}</h3>
        {result.author ? (
          <p className="explore-book-author" title={result.author}>{result.author}</p>
        ) : null}
        {result.last_chapter ? (
          <p className="explore-book-chapter" title={result.last_chapter}>
            {result.last_chapter}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function SkeletonGrid() {
  return (
    <div className="explore-book-grid">
      {Array.from({ length: 12 }).map((_, index) => (
        <li className="explore-book-card skeleton" key={index}>
          <div className="explore-book-cover" />
          <div className="explore-book-info">
            <div className="skeleton-line" style={{ height: '14px', marginBottom: '6px' }} />
            <div className="skeleton-line short" style={{ height: '11px' }} />
          </div>
        </li>
      ))}
    </div>
  );
}

export function ExploreTab({ sources }: { sources: YeaderSource[] }) {
  const enabledSources = useMemo(
    () => sources.filter((source) => source.enabled !== false),
    [sources],
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    () => enabledSources[0]?.id ?? "",
  );
  const [categories, setCategories] = useState<YeaderExploreCategory[]>([]);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("");
  const [selectedOrderKey, setSelectedOrderKey] = useState<string>("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!enabledSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(enabledSources[0]?.id ?? "");
    }
  }, [enabledSources, selectedSourceId]);

  useEffect(() => {
    if (!selectedSourceId) {
      setCategories([]);
      setSelectedCategoryKey("");
      return;
    }
    listExploreCategories(selectedSourceId)
      .then((list) => {
        setCategories(list);
        setSelectedCategoryKey(list[0]?.key ?? "");
        setResults([]);
        setError("");
      })
      .catch(() => {
        setCategories([]);
        setSelectedCategoryKey("");
      });
  }, [selectedSourceId]);

  const selectedCategory = useMemo(
    () => categories.find((entry) => entry.key === selectedCategoryKey),
    [categories, selectedCategoryKey],
  );

  const orderOptions: ReadonlyArray<YeaderExploreOrder> = useMemo(
    () => selectedCategory?.orderOptions ?? [],
    [selectedCategory],
  );

  useEffect(() => {
    if (orderOptions.length === 0) {
      setSelectedOrderKey("");
      return;
    }
    if (!orderOptions.some((order) => order.key === selectedOrderKey)) {
      setSelectedOrderKey(orderOptions[0].key);
    }
  }, [orderOptions, selectedOrderKey]);

  const activeOrder = useMemo(
    () => orderOptions.find((order) => order.key === selectedOrderKey),
    [orderOptions, selectedOrderKey],
  );

  useEffect(() => {
    if (!selectedSourceId || !selectedCategoryKey) return;
    if (orderOptions.length > 0 && !activeOrder) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    exploreBooks(
      selectedSourceId,
      selectedCategoryKey,
      activeOrder?.variables ?? {},
    )
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setResults([]);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSourceId, selectedCategoryKey, activeOrder, orderOptions.length]);

  const grouped = useMemo(() => groupCategories(categories), [categories]);
  const selectedSource = enabledSources.find(
    (source) => source.id === selectedSourceId,
  );

  if (enabledSources.length === 0) {
    return (
      <div className="source-ops-panel">
        <div className="empty-state">
          <p>暂无启用的书源。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="explore-shell">
      <div className="explore-hero">
        <div className="explore-hero-text">
          <span className="explore-hero-eyebrow">Discover</span>
          <h2 className="explore-hero-title">
            {selectedCategory?.label ?? "选择一个分类"}
          </h2>
          <p className="explore-hero-meta">
            {selectedSource ? selectedSource.name : ""}
            {selectedCategory ? ` · ${selectedCategory.group ?? UNCATEGORIZED_GROUP}` : ""}
            {activeOrder ? ` · ${activeOrder.label}` : ""}
          </p>
        </div>
        {enabledSources.length > 1 ? (
          <select
            className="form-input explore-source-select"
            value={selectedSourceId}
            onChange={(event) => setSelectedSourceId(event.target.value)}
            aria-label="切换书源"
          >
            {enabledSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <p className="explore-empty">该书源未提供分类发现。</p>
      ) : (
        <div className="explore-sidebar-layout">
          <aside className="explore-sidebar">
            {grouped.map(({ group, items }) => (
              <div className="explore-group" key={group}>
                <div className="explore-group-label">{group}</div>
                <ul className="explore-category-list">
                  {items.map((category) => (
                    <li key={category.key}>
                      <button
                        type="button"
                        className={`explore-category-chip ${selectedCategoryKey === category.key ? "active" : ""}`}
                        onClick={() => setSelectedCategoryKey(category.key)}
                      >
                        {category.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          <section className="explore-main">
            {orderOptions.length > 0 ? (
              <div className="explore-order-bar">
                {orderOptions.map((order) => (
                  <button
                    key={order.key}
                    type="button"
                    className={`explore-order-chip ${selectedOrderKey === order.key ? "active" : ""}`}
                    onClick={() => setSelectedOrderKey(order.key)}
                  >
                    {order.label}
                  </button>
                ))}
              </div>
            ) : null}

            {loading ? <SkeletonGrid /> : null}
            {error ? <p className="explore-error">加载失败: {error}</p> : null}
            {!loading && !error && results.length === 0 && selectedCategoryKey ? (
              <p className="explore-status">没有结果。</p>
            ) : null}

            {!loading && results.length > 0 ? (
              <ul className="explore-book-grid">
                {results.map((result) => (
                  <BookGridCard
                    key={`${result.source_id}|${result.book_url}`}
                    result={result}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
