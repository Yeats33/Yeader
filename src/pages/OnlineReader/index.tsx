import { useEffect, useState } from "react";
import { navigate } from "../../router.ts";
import { fetchBookInfo, fetchToc, addBookToShelf } from "../../api.ts";
import type { BookInfo, Chapter } from "../../types.ts";

type OnlineReaderPageProps = {
  bookUrl: string;
  sourceUrl: string;
};

type LoadState =
  | { status: "loading"; bookInfo: null; chapters: Chapter[]; error: null }
  | { status: "ready"; bookInfo: BookInfo; chapters: Chapter[]; error: null }
  | { status: "error"; bookInfo: null; chapters: Chapter[]; error: string };

export function OnlineReaderPage({ bookUrl, sourceUrl }: OnlineReaderPageProps) {
  const [state, setState] = useState<LoadState>({
    status: "loading",
    bookInfo: null,
    chapters: [],
    error: null,
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", bookInfo: null, chapters: [], error: null });

    async function loadBook() {
      try {
        const bookInfo = await fetchBookInfo(bookUrl, sourceUrl);
        const chapters = await fetchToc(bookUrl, sourceUrl);
        if (!cancelled) {
          setState({ status: "ready", bookInfo, chapters, error: null });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            bookInfo: null,
            chapters: [],
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    void loadBook();

    return () => {
      cancelled = true;
    };
  }, [bookUrl, sourceUrl]);

  async function addToShelf(bookInfo: BookInfo) {
    setAdding(true);
    try {
      await addBookToShelf({
        url: bookUrl,
        name: bookInfo.name,
        author: bookInfo.author,
        source_url: sourceUrl,
        cover_url: bookInfo.cover_url,
        toc_url: bookInfo.toc_url,
        intro: bookInfo.intro,
      });
      navigate("/");
    } finally {
      setAdding(false);
    }
  }

  function openChapter(chapterUrl: string) {
    navigate(`/online-reader/${encodeURIComponent(bookUrl)}/${encodeURIComponent(sourceUrl)}/chapter/${encodeURIComponent(chapterUrl)}`);
  }

  return (
    <div className="page page-online-reader">
      <header className="page-header">
        <button className="btn-icon" type="button" onClick={() => navigate("/discover")} title="返回发现">
          &#x2190;
        </button>
        <h1>{state.bookInfo?.name ?? "加载中..."}</h1>
      </header>

      <div className="online-book-info">
        {state.status === "loading" ? <div className="loading">加载书籍信息...</div> : null}
        {state.status === "error" ? <div className="error-msg">加载失败: {state.error}</div> : null}
        {state.status === "ready" ? (
          <>
            <div className="book-info-card">
              {state.bookInfo.cover_url ? (
                <img src={state.bookInfo.cover_url} alt={state.bookInfo.name} className="book-cover" />
              ) : null}
              <div className="book-meta">
                <h2>{state.bookInfo.name}</h2>
                <p className="book-author">{state.bookInfo.author}</p>
                {state.bookInfo.kind ? <p className="book-kind">{state.bookInfo.kind}</p> : null}
                {state.bookInfo.intro ? <p className="book-intro">{state.bookInfo.intro}</p> : null}
                {state.bookInfo.last_chapter ? <p className="book-last-chapter">最新: {state.bookInfo.last_chapter}</p> : null}
              </div>
            </div>
            <button
              className="btn-primary"
              type="button"
              disabled={adding}
              onClick={() => void addToShelf(state.bookInfo)}
            >
              {adding ? "加入中..." : "加入阅读"}
            </button>
          </>
        ) : null}
      </div>

      <div className="online-toc">
        {state.status === "loading" ? <div className="loading">加载目录...</div> : null}
        {state.status === "ready" && state.chapters.length === 0 ? <p className="muted-text">暂无目录</p> : null}
        {state.status === "ready" && state.chapters.length > 0 ? (
          <>
            <h3>目录</h3>
            <ul className="toc-list">
              {state.chapters.map((chapter, index) => (
                <li
                  className="toc-item"
                  data-chapter-index={String(index + 1)}
                  key={`${chapter.url}-${index}`}
                  onClick={() => openChapter(chapter.url)}
                >
                  <span className="toc-title">{chapter.title}</span>
                  {chapter.is_vip ? <span className="vip-badge">VIP</span> : null}
                  {chapter.is_volume ? <span className="volume-badge">卷</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
