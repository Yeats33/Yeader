import { useEffect, useMemo, useState } from "react";
import { searchBooks, listBookSources } from "../api.ts";
import { navigate } from "../router.ts";
import type { LegacyBookSource, SearchResult } from "../types.ts";
import {
  LEGACY_BOOK_SOURCE_COMPAT_DISABLED_MESSAGE,
  LEGACY_BOOK_SOURCE_COMPAT_ENABLED,
} from "../compatibility.ts";
import {
  parseSearchSourceTags,
  resolveSearchSources,
} from "./Search.ts";

const SEARCH_TAG_UNTAGGED = "__untagged";

function describeScopeLabel(selectedTag: string, selectedSource: string): string {
  const tagLabel = selectedTag.startsWith("tag:")
    ? `标签：${selectedTag.slice("tag:".length)}`
    : "标签：全部";
  const sourceLabel = selectedSource.startsWith("source:")
    ? "书源：单个"
    : "书源：全部";
  return `${tagLabel} · ${sourceLabel}`;
}

function ResultCard({ result }: { result: SearchResult }) {
  const target = `/online-reader/${encodeURIComponent(result.book_url)}/${encodeURIComponent(result.source_id)}`;

  return (
    <li
      className="result-card"
      data-book-url={result.book_url}
      tabIndex={0}
      role="button"
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(target);
        }
      }}
    >
      <div className="result-cover">
        {result.cover_url ? (
          <img src={result.cover_url} alt={result.name} loading="lazy" />
        ) : (
          <div className="result-cover-placeholder"><span>{result.name.charAt(0)}</span></div>
        )}
      </div>
      <div className="result-info">
        <div className="result-heading">
          <h3 className="result-title" title={result.name}>{result.name}</h3>
          {result.kind ? <span className="result-kind">{result.kind}</span> : null}
        </div>
        {result.author ? <p className="result-author" title={result.author}>{result.author}</p> : null}
        {result.intro ? <p className="result-intro">{result.intro}</p> : null}
        {result.last_chapter ? <p className="result-chapter">最新: {result.last_chapter}</p> : null}
      </div>
    </li>
  );
}

export function SearchPage() {
  const [sources, setSources] = useState<LegacyBookSource[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!LEGACY_BOOK_SOURCE_COMPAT_ENABLED) return;
    listBookSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);
  const tagNames = useMemo(() => Array.from(
    new Set(enabledSources.flatMap((source) => parseSearchSourceTags(source.bookSourceGroup))),
  ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN")), [enabledSources]);
  const hasUntagged = enabledSources.some((source) => parseSearchSourceTags(source.bookSourceGroup).length === 0);

  const visibleSourceChips = useMemo(() => {
    if (!selectedTag.startsWith("tag:")) {
      return enabledSources;
    }
    const tagName = selectedTag.slice("tag:".length);
    if (tagName === SEARCH_TAG_UNTAGGED) {
      return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).length === 0);
    }
    return enabledSources.filter((source) => parseSearchSourceTags(source.bookSourceGroup).includes(tagName));
  }, [enabledSources, selectedTag]);

  useEffect(() => {
    if (!selectedSource) return;
    const sourceUrl = selectedSource.slice("source:".length);
    if (!visibleSourceChips.some((source) => source.bookSourceUrl === sourceUrl)) {
      setSelectedSource("");
    }
  }, [selectedSource, visibleSourceChips]);

  async function doSearch() {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;

    setSearching(true);
    setSearched(true);
    setResults([]);
    setFailures([]);

    try {
      const allSources = await listBookSources();
      setSources(allSources);
      const selectedSources = resolveSearchSources(selectedTag, selectedSource, allSources);
      if (selectedSources.length === 0) {
        return;
      }

      const settled = await Promise.allSettled(
        selectedSources.map((source) => searchBooks(source.bookSourceUrl, trimmedKeyword, 1)),
      );
      const nextResults: SearchResult[] = [];
      const nextFailures: string[] = [];

      settled.forEach((result, index) => {
        const source = selectedSources[index];
        if (result.status === "fulfilled") {
          nextResults.push(...result.value);
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          nextFailures.push(`${source.bookSourceName}: ${msg}`);
        }
      });

      setResults(nextResults);
      setFailures(nextFailures);
    } finally {
      setSearching(false);
    }
  }

  if (!LEGACY_BOOK_SOURCE_COMPAT_ENABLED) {
    return (
      <div className="page page-search">
        <header className="page-header">
          <h1>搜索</h1>
          <button className="btn-icon" type="button" onClick={() => navigate("/")} title="返回书架">&#x2190;</button>
        </header>
        <div className="empty-state"><p>{LEGACY_BOOK_SOURCE_COMPAT_DISABLED_MESSAGE}</p></div>
      </div>
    );
  }

  const selectedSources = resolveSearchSources(selectedTag, selectedSource, sources);
  const noSelectedSources = searched && !searching && selectedSources.length === 0;
  const noResults = searched && !searching && selectedSources.length > 0 && results.length === 0;

  return (
    <div className="page page-search">
      <header className="page-header">
        <h1>搜索</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/")} title="返回书架">&#x2190;</button>
      </header>
      <div className="search-form">
        <div className="search-hero">
          <div>
            <span className="search-kicker">全局书源搜索</span>
            <h2>查找书名、作者或关键词</h2>
          </div>
          <span className="search-source-count">
            已启用 {enabledSources.length} 个书源
          </span>
        </div>
        <div className="search-source-picker" data-selected-tag={selectedTag} data-selected-source={selectedSource}>
          <div className="search-source-status">{describeScopeLabel(selectedTag, selectedSource)}</div>
          <div className="search-filter-row">
            <span className="search-filter-label">按标签筛选书源</span>
            <button className={`search-filter-chip ${selectedTag === "" ? "active" : ""}`} type="button" onClick={() => setSelectedTag("")}>全部标签</button>
            {hasUntagged ? (
              <button className={`search-filter-chip ${selectedTag === `tag:${SEARCH_TAG_UNTAGGED}` ? "active" : ""}`} type="button" onClick={() => setSelectedTag(`tag:${SEARCH_TAG_UNTAGGED}`)}>标签：未标记</button>
            ) : null}
            {tagNames.map((tagName) => (
              <button className={`search-filter-chip ${selectedTag === `tag:${tagName}` ? "active" : ""}`} type="button" onClick={() => setSelectedTag(`tag:${tagName}`)} key={tagName}>标签：{tagName}</button>
            ))}
          </div>
          {visibleSourceChips.length > 0 ? (
            <div className="search-filter-row search-filter-row--sources">
              <span className="search-filter-label">选择具体书源</span>
              <button className={`search-filter-chip search-filter-chip--source ${selectedSource === "" ? "active" : ""}`} type="button" onClick={() => setSelectedSource("")}>全部书源</button>
              {visibleSourceChips.map((source) => (
                <button
                  className={`search-filter-chip search-filter-chip--source ${selectedSource === `source:${source.bookSourceUrl}` ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedSource(`source:${source.bookSourceUrl}`)}
                  key={source.bookSourceUrl}
                >
                  {source.bookSourceName}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="search-input-row">
          <input
            type="text"
            className="search-input"
            placeholder="输入书名或作者..."
            autoComplete="off"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doSearch();
            }}
          />
          <button className="btn-primary" type="button" disabled={searching} onClick={() => void doSearch()}>搜索</button>
        </div>
      </div>
      <div className="search-results">
        {searching ? <div className="loading">搜索中...</div> : null}
        {failures.length > 0 ? (
          <details className="search-failures">
            <summary>{failures.length} 个书源报错</summary>
            <ul>{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>
          </details>
        ) : null}
        {noSelectedSources ? <div className="empty-state"><p>暂无匹配的启用书源，请先去设置检查标签或书源状态。</p></div> : null}
        {noResults ? <div className="empty-state"><p>未找到相关书籍</p></div> : null}
        {!searching && results.length > 0 ? (
          <>
            <div className="search-results-header">
              <span>找到 {results.length} 个结果</span>
              <small>{describeScopeLabel(selectedTag, selectedSource)}</small>
            </div>
            <ul className="result-list">
              {results.map((result, index) => <ResultCard result={result} key={`${result.source_id}-${result.book_url}-${index}`} />)}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
