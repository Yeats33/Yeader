import { useMemo, useState, type KeyboardEvent } from "react";
import { searchBooks } from "../api.ts";
import { navigate } from "../router.ts";
import type { SearchResult, YeaderSource } from "../types.ts";

function hasSearchCapability(source: YeaderSource): boolean {
  return (source.capabilities ?? []).some((cap) => cap.kind === "search");
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
        {result.intro ? (
          <p className="explore-book-chapter" title={result.intro}>{result.intro}</p>
        ) : result.last_chapter ? (
          <p className="explore-book-chapter" title={result.last_chapter}>{result.last_chapter}</p>
        ) : null}
      </div>
    </li>
  );
}

function SkeletonGrid() {
  return (
    <ul className="explore-book-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <li className="explore-book-card skeleton" key={index}>
          <div className="explore-book-cover" />
          <div className="explore-book-info">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SourceSearchTab({ sources }: { sources: YeaderSource[] }) {
  const enabledSources = useMemo(
    () => sources.filter((source) => source.enabled !== false),
    [sources],
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    () => enabledSources[0]?.id ?? "",
  );
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedSource = enabledSources.find((source) => source.id === selectedSourceId);
  const supportsSearch = selectedSource ? hasSearchCapability(selectedSource) : false;

  async function runSearch() {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("请输入关键词");
      return;
    }
    if (!selectedSource) {
      setError("请选择书源");
      return;
    }
    if (!supportsSearch) {
      setError("当前书源不支持搜索");
      return;
    }
    setError("");
    setLoading(true);
    setSubmitted(trimmed);
    try {
      const items = await searchBooks(selectedSource.id, trimmed);
      setResults(items);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void runSearch();
    }
  }

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
          <span className="explore-hero-eyebrow">搜索</span>
          <h2 className="explore-hero-title">书源内搜索</h2>
          <p className="explore-hero-meta">
            {selectedSource ? selectedSource.name : ""}
            {selectedSource ? (supportsSearch ? " · 支持搜索" : " · 不支持搜索") : ""}
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

      <div className="source-search-bar">
        <input
          type="text"
          className="form-input source-search-input"
          placeholder={supportsSearch ? `在「${selectedSource?.name ?? ""}」搜索…` : "当前书源不支持搜索"}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={!supportsSearch}
          autoFocus
        />
        <button
          className="btn-primary source-search-submit"
          type="button"
          onClick={runSearch}
          disabled={!supportsSearch || loading}
        >
          {loading ? "搜索中…" : "搜索"}
        </button>
      </div>

      {!supportsSearch ? (
        <p className="explore-status">该书源没有定义 search 能力，请到「书源列表」检查或换源。</p>
      ) : null}
      {error ? <p className="explore-error">{error}</p> : null}
      {loading ? <SkeletonGrid /> : null}
      {!loading && !error && submitted && results.length === 0 ? (
        <p className="explore-status">没有找到「{submitted}」的结果。</p>
      ) : null}

      {!loading && results.length > 0 ? (
        <>
          <p className="explore-status">共 {results.length} 个结果 · 关键词「{submitted}」</p>
          <ul className="explore-book-grid">
            {results.map((result) => (
              <BookGridCard
                key={`${result.source_id}|${result.book_url}`}
                result={result}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
