import { useState, useEffect, useCallback } from "react";
import { showToast, dismissToast } from "../components/Toast.ts";
import {
  listYeaderSources,
  fetchFeed,
  exploreBooks,
  fetchBookInfo,
  fetchToc,
  fetchContent,
  listExploreCategories,
} from "../api.ts";
import type {
  YeaderSource,
  FeedItem,
  SearchResult,
  BookInfo,
  Chapter,
  YeaderExploreCategory,
} from "../types.ts";

export type SourceType = "rss" | "book" | "plugin";

/**
 * @deprecated Old source-specific three-panel browsing surface.
 * Keep temporarily as reference for source preview behavior: RSS item preview,
 * book explore preview, TOC preview, and first-chapter preview. New source
 * management should live under /sources and user browsing under /discover or /feed.
 */
// Source type indicator colors
export const SOURCE_TYPE_COLORS: Record<SourceType, { bg: string; text: string }> = {
  rss: { bg: "#f97316", text: "#ffffff" },
  book: { bg: "#3b82f6", text: "#ffffff" },
  plugin: { bg: "#6b7280", text: "#ffffff" },
};

interface SourcePanelsProps {
  sourceType: SourceType;
}

// ── Left Panel (Source List) ──────────────────────────────────────

interface LeftPanelProps {
  sourceType: SourceType;
  sources: YeaderSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
}

function SourceLeftPanel({
  sourceType,
  sources,
  selectedSourceId,
  onSelectSource,
  loading,
}: LeftPanelProps & { loading?: boolean }) {
  const categoryLabels: Record<SourceType, string> = {
    rss: "RSS 订阅源",
    book: "书源",
    plugin: "插件源",
  };

  const { bg, text } = SOURCE_TYPE_COLORS[sourceType];

  return (
    <aside className="left-panel">
      <div className="left-panel-header">
        <h2>{categoryLabels[sourceType]}</h2>
      </div>

      <div className="left-panel-scroll">
        {loading ? (
          <div className="left-panel-empty">加载中...</div>
        ) : sources.length === 0 ? (
          <div className="left-panel-empty">
            暂无{sourceType === "rss" ? "RSS 订阅源" : sourceType === "book" ? "书源" : "插件"}
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className={`source-item${selectedSourceId === source.id ? " selected" : ""}`}
              onClick={() => onSelectSource(source.id)}
            >
              <span className="source-icon">
                {sourceType === "rss" ? (
                  "📡"
                ) : sourceType === "book" ? (
                  "📚"
                ) : (
                  "🔌"
                )}
              </span>
              <span className="source-name">{source.name}</span>
              <span
                className="source-badge"
                style={{ background: bg, color: text }}
              >
                {sourceType === "rss" ? "RSS" : sourceType === "book" ? "书源" : "插件"}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ── Middle Panel (Content List) ──────────────────────────────────

interface MiddleContentPanelProps {
  sourceType: SourceType;
  source: YeaderSource | null;
  items: FeedItem[] | SearchResult[];
  loading: boolean;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}

function MiddleContentPanel({
  sourceType,
  source,
  items,
  loading,
  selectedItemId,
  onSelectItem,
}: MiddleContentPanelProps) {
  if (!source) {
    return (
      <section className="middle-panel">
        <div className="middle-panel-empty">选择一个{sourceType === "rss" ? "RSS 源" : "书源"}</div>
      </section>
    );
  }

  const isRss = sourceType === "rss";
  const isBook = sourceType === "book";
  const { bg } = SOURCE_TYPE_COLORS[sourceType];

  return (
    <section className="middle-panel">
      <div className="middle-panel-header">
        <h3>{source.name}</h3>
        {!loading && (
          <span className="item-count">{items.length} 项</span>
        )}
      </div>

      <div className="middle-panel-scroll">
        {loading ? (
          <div className="middle-panel-empty">加载中...</div>
        ) : items.length === 0 ? (
          <div className="middle-panel-empty">
            {sourceType === "plugin"
              ? "插件功能开发中..."
              : "暂无内容"}
          </div>
        ) : sourceType === "plugin" ? (
          <div className="middle-panel-coming-soon">
            <div className="coming-soon-icon">🔌</div>
            <h3>插件源</h3>
            <p>插件功能正在开发中，敬请期待。</p>
            <p className="coming-soon-hint">
              插件将提供高级自动化和自定义功能。
            </p>
          </div>
        ) : isRss ? (
          (items as FeedItem[]).map((item) => (
            <div
              key={item.id}
              className={`feed-item${selectedItemId === item.id ? " selected" : ""}`}
              onClick={() => onSelectItem(item.id)}
            >
              <div className="feed-item-title">{item.title}</div>
              <div className="feed-item-meta">
                {item.author ? `${item.author} · ` : ""}
                {item.published ? formatDate(item.published) : ""}
              </div>
              {item.summary ? (
                <div className="feed-item-summary">{stripHtml(item.summary)}</div>
              ) : null}
              {item.imageUrl ? (
                <img
                  className="feed-item-image"
                  src={item.imageUrl}
                  alt=""
                  loading="lazy"
                />
              ) : null}
            </div>
          ))
        ) : isBook ? (
          (items as SearchResult[]).map((item) => (
            <div
              key={`${item.source_id}|${item.book_url}`}
              className={`feed-item${selectedItemId === `${item.source_id}|${item.book_url}` ? " selected" : ""}`}
              onClick={() => onSelectItem(`${item.source_id}|${item.book_url}`)}
            >
              <div className="feed-item-with-cover">
                {item.cover_url ? (
                  <img
                    className="feed-item-cover"
                    src={item.cover_url}
                    alt={item.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="feed-item-cover-placeholder" style={{ background: bg }}>
                    {item.name.charAt(0)}
                  </div>
                )}
                <div className="feed-item-content">
                  <div className="feed-item-title">{item.name}</div>
                  <div className="feed-item-meta">{item.author}</div>
                  {item.intro ? (
                    <div className="feed-item-summary">{stripHtml(item.intro)}</div>
                  ) : null}
                  {item.last_chapter ? (
                    <div className="feed-item-chapter">{item.last_chapter}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : null}
      </div>
    </section>
  );
}

// ── Right Panel (Content Detail) ────────────────────────────────

interface RightContentPanelProps {
  sourceType: SourceType;
  item: FeedItem | SearchResult | null;
  bookInfo: BookInfo | null;
  toc: Chapter[];
  content: string | null;
  loadingDetail: boolean;
  loadingToc: boolean;
  loadingContent: boolean;
  selectedChapterIndex: number;
  onSelectChapter: (index: number) => void;
}

function RightContentPanel({
  sourceType,
  item,
  bookInfo,
  toc,
  content,
  loadingDetail,
  loadingToc,
  loadingContent,
  selectedChapterIndex,
  onSelectChapter,
}: RightContentPanelProps) {
  if (!item) {
    return (
      <main className="right-panel">
        <div className="right-panel-empty">
          {sourceType === "plugin"
            ? "选择一个插件查看详情"
            : "选择一项查看详情"}
        </div>
      </main>
    );
  }

  if (sourceType === "plugin") {
    return (
      <main className="right-panel">
        <div className="right-panel-coming-soon">
          <div className="coming-soon-icon">🔌</div>
          <h2>插件详情</h2>
          <p>插件功能正在开发中，暂不支持详情查看。</p>
        </div>
      </main>
    );
  }

  if (sourceType === "rss") {
    if (loadingDetail) {
      return (
        <main className="right-panel">
          <div className="right-panel-empty">加载中...</div>
        </main>
      );
    }
    const feedItem = item as FeedItem;
    return (
      <main className="right-panel">
        <div className="right-panel-header">
          <h2>{feedItem.title}</h2>
        </div>
        <div className="right-panel-scroll">
          <article className="article-content">
            <h1>{feedItem.title}</h1>
            <div className="article-meta">
              {feedItem.author ? <span>By {feedItem.author} · </span> : null}
              {feedItem.published ? <span>{formatDate(feedItem.published)}</span> : null}
            </div>
            {feedItem.contentHtml || feedItem.summary ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(feedItem.contentHtml || feedItem.summary || ""),
                }}
              />
            ) : (
              <p>暂无内容。</p>
            )}
          </article>
        </div>
      </main>
    );
  }

  // Book source
  const searchResult = item as SearchResult;

  return (
    <main className="right-panel">
      <div className="right-panel-header">
        <h2>{bookInfo?.name || searchResult.name}</h2>
      </div>

      <div className="right-panel-scroll right-panel-book">
        {/* Book Info */}
        <div className="book-detail-header">
          {searchResult.cover_url && (
            <img
              className="book-detail-cover"
              src={searchResult.cover_url}
              alt={searchResult.name}
            />
          )}
          <div className="book-detail-info">
            <h3>{searchResult.name}</h3>
            <p className="book-detail-author">作者: {searchResult.author}</p>
            {searchResult.intro && (
              <p className="book-detail-intro">{searchResult.intro}</p>
            )}
            {bookInfo?.word_count && (
              <p className="book-detail-meta">字数: {bookInfo.word_count}</p>
            )}
          </div>
        </div>

        {/* TOC */}
        {loadingToc ? (
          <div className="book-toc-loading">加载目录中...</div>
        ) : toc.length > 0 ? (
          <div className="book-toc">
            <h3>目录</h3>
            <ul className="book-toc-list">
              {toc.map((chapter, index) => (
                <li
                  key={chapter.url}
                  className={`book-toc-item${selectedChapterIndex === index ? " active" : ""}${chapter.is_vip ? " vip" : ""}`}
                  onClick={() => onSelectChapter(index)}
                >
                  <span className="book-toc-title">
                    {chapter.is_vip ? "🔒 " : ""}
                    {chapter.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Chapter Content */}
        {loadingContent ? (
          <div className="book-content-loading">加载正文中...</div>
        ) : content ? (
          <div className="book-content">
            <h3>{toc[selectedChapterIndex]?.title || "正文"}</h3>
            <div
              className="book-content-text"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

// ── Main SourcePanels Component ──────────────────────────────────

// Helper to get source URL from capabilities (for RSS feeds)
function getSourceFeedUrl(source: YeaderSource): string | undefined {
  return source.capabilities?.find((c) => c.kind === "feed")?.request?.url;
}

/**
 * @deprecated Use /sources for management, /discover for browsing, and /feed
 * for subscribed content. Extract useful preview flows before removing this.
 */
export function SourcePanels({ sourceType }: SourcePanelsProps) {
  const [allSources, setAllSources] = useState<YeaderSource[]>([]);
  const [filteredSources, setFilteredSources] = useState<YeaderSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [toc, setToc] = useState<Chapter[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingToc, setLoadingToc] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [categories, setCategories] = useState<YeaderExploreCategory[]>([]);

  // Load all sources
  useEffect(() => {
    let cancelled = false;
    setLoadingSources(true);

    listYeaderSources()
      .then((sources) => {
        if (cancelled) return;
        setAllSources(sources);
      })
      .catch(() => {
        if (cancelled) return;
        setAllSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter sources by type
  useEffect(() => {
    const typeMapping: Record<SourceType, string[]> = {
      rss: ["rss"],
      book: ["novel", "generic"],
      plugin: [],
    };

    const allowedTypes = typeMapping[sourceType];
    const filtered =
      sourceType === "plugin"
        ? allSources.filter((s) => !["rss", "novel", "generic"].includes(s.mediaType))
        : allSources.filter((s) => allowedTypes.includes(s.mediaType));

    setFilteredSources(filtered);

    // Auto-select first source if none selected
    if (filtered.length > 0 && !selectedSourceId) {
      setSelectedSourceId(filtered[0].id);
    }
  }, [allSources, sourceType, selectedSourceId]);

  // Load content when source changes
  useEffect(() => {
    if (!selectedSourceId) return;

    const source = filteredSources.find((s) => s.id === selectedSourceId);
    if (!source) return;

    if (sourceType === "rss") {
      loadRssFeed(source);
    } else if (sourceType === "book") {
      loadBookExplore(source);
    }
  }, [selectedSourceId]);

  const loadRssFeed = async (source: YeaderSource) => {
    setLoadingItems(true);
    setFeedItems([]);
    setSelectedItemId(null);

    const feedUrl = getSourceFeedUrl(source) || source.homepage;
    if (!feedUrl) {
      showToast("error", `${source.name} 没有配置订阅地址`);
      setLoadingItems(false);
      return;
    }

    const toastId = showToast("loading", `加载 ${source.name}...`);

    try {
      const items = await fetchFeed(feedUrl);
      setFeedItems(items);
      dismissToast(toastId);
      showToast("success", `已加载 ${items.length} 条内容`);
    } catch {
      dismissToast(toastId);
      showToast("error", `加载失败: ${source.name}`);
      setFeedItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const loadBookExplore = async (source: YeaderSource) => {
    // First load categories
    try {
      const cats = await listExploreCategories(source.id);
      setCategories(cats);
    } catch {
      setCategories([]);
    }

    // Load first category
    if (categories.length > 0) {
      await loadBookResults(source, categories[0].key);
    }
  };

  const loadBookResults = async (source: YeaderSource, categoryKey: string) => {
    setLoadingItems(true);
    setSearchResults([]);
    setSelectedItemId(null);
    setSelectedSearchResult(null);

    const toastId = showToast("loading", "加载书源内容...");

    try {
      const results = await exploreBooks(source.id, categoryKey);
      setSearchResults(results);
      dismissToast(toastId);
      showToast("success", `已加载 ${results.length} 本书`);
    } catch {
      dismissToast(toastId);
      showToast("error", "加载书源内容失败");
      setSearchResults([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectSource = useCallback(
    (id: string) => {
      setSelectedSourceId(id);
      setSelectedItemId(null);
      setSelectedSearchResult(null);
      setBookInfo(null);
      setToc([]);
      setContent(null);
      setSelectedChapterIndex(0);
    },
    [],
  );

  const handleSelectItem = useCallback(
    async (id: string) => {
      setSelectedItemId(id);

      if (sourceType === "rss") {
        // Feed items don't need additional loading
        setSelectedSearchResult(null);
        setBookInfo(null);
        setToc([]);
        setContent(null);
      } else if (sourceType === "book") {
        const source = filteredSources.find((s) => s.id === selectedSourceId);
        if (!source) return;

        const [_sourceId, _bookUrl] = id.split("|");
        const result = searchResults.find(
          (r) => `${r.source_id}|${r.book_url}` === id,
        );
        if (!result) return;

        setSelectedSearchResult(result);
        await loadBookDetail(result, source);
      }
    },
    [sourceType, selectedSourceId, filteredSources, searchResults],
  );

  const loadBookDetail = async (result: SearchResult, source: YeaderSource) => {
    setLoadingDetail(true);
    setLoadingToc(true);
    setContent(null);

    try {
      // Load book info
      const info = await fetchBookInfo(result.book_url, result.source_id || source.id);
      setBookInfo(info);

      // Load TOC
      const tableOfContents = await fetchToc(result.book_url, result.source_id || source.id);
      setToc(tableOfContents);
      setSelectedChapterIndex(0);

      // Load first chapter
      if (tableOfContents.length > 0) {
        await loadChapterContent(tableOfContents[0].url, result, source);
      }
    } catch {
      showToast("error", "加载书籍详情失败");
    } finally {
      setLoadingDetail(false);
      setLoadingToc(false);
    }
  };

  const loadChapterContent = async (
    chapterUrl: string,
    result: SearchResult,
    source: YeaderSource,
  ) => {
    setLoadingContent(true);

    try {
      const html = await fetchContent(
        chapterUrl,
        result.book_url,
        result.source_id || source.id,
        selectedChapterIndex,
      );
      setContent(html);
    } catch {
      showToast("error", "加载章节内容失败");
      setContent("<p>加载失败，请重试。</p>");
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSelectChapter = useCallback(
    async (index: number) => {
      if (!selectedSearchResult) return;
      setSelectedChapterIndex(index);

      const source = filteredSources.find((s) => s.id === selectedSourceId);
      if (!source || !toc[index]) return;

      await loadChapterContent(toc[index].url, selectedSearchResult, source);
    },
    [selectedSearchResult, selectedSourceId, filteredSources, toc],
  );

  const selectedSource = filteredSources.find((s) => s.id === selectedSourceId) ?? null;

  const selectedItem =
    selectedItemId && sourceType === "rss"
      ? feedItems.find((i) => i.id === selectedItemId) ?? null
      : selectedSearchResult;

  const middleItems =
    sourceType === "rss"
      ? feedItems
      : sourceType === "book"
        ? searchResults
        : [];

  return (
    <div className="threepanel-layout">
      <SourceLeftPanel
        sourceType={sourceType}
        sources={filteredSources}
        selectedSourceId={selectedSourceId}
        onSelectSource={handleSelectSource}
        loading={loadingSources}
      />
      <MiddleContentPanel
        sourceType={sourceType}
        source={selectedSource}
        items={middleItems}
        loading={loadingItems}
        selectedItemId={selectedItemId}
        onSelectItem={handleSelectItem}
      />
      <RightContentPanel
        sourceType={sourceType}
        item={selectedItem as FeedItem | SearchResult | null}
        bookInfo={bookInfo}
        toc={toc}
        content={content}
        loadingDetail={loadingDetail}
        loadingToc={loadingToc}
        loadingContent={loadingContent}
        selectedChapterIndex={selectedChapterIndex}
        onSelectChapter={handleSelectChapter}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "");
}
