import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchBookInfo,
  fetchToc,
  getBook,
  getReadingProgress,
  getEpubToc,
} from "../../api.ts";
import { navigate } from "../../router.ts";
import { createInitialState } from "./types.ts";
import type { Bookmark, ReaderState } from "./types.ts";
import {
  readChapterContent,
  saveCurrentReadingProgress,
} from "./chapter.ts";
import {
  applyReaderStyle,
  applyReaderStyleToContent,
  loadReaderStyle,
  saveReaderStyleSettings,
} from "./style.ts";
import {
  deleteBookmark,
  loadBookmarks,
  saveCurrentBookmark,
} from "./bookmarks.ts";
import {
  getColorModePreference,
  setColorMode,
  type ColorModePreference,
} from "../../theme.ts";
import { convertChineseScript, type ChineseScript } from "../../utils/chineseConvert.ts";
import { themeManager, type Theme } from "../../utils/themeManager.ts";
import type { Chapter } from "../../types.ts";

const CHAPTER_NUMBER_PATTERN =
  /第[一二三四五六七八九十百千万\d]+[章回节集卷部]|Chapter\s*\d+|\bVol\.?\s*\d+|\d+[.\s、]/i;

type ChapterLoadState =
  | { status: "loading"; html: string; error: string }
  | { status: "ready"; html: string; error: string }
  | { status: "error"; html: string; error: string };

function shouldAutoNumber(chapters: Chapter[]): boolean {
  if (chapters.length === 0) return false;
  const sample = chapters.slice(0, Math.min(5, chapters.length));
  return !sample.some((ch) => CHAPTER_NUMBER_PATTERN.test(ch.title));
}

function createReaderStyle(state: ReaderState): CSSProperties {
  return {
    "--font-size": `${state.fontSize}px`,
    "--line-height": String(state.lineHeight),
    "--font-family": state.fontFamily,
  } as CSSProperties;
}

async function loadReaderState(
  encodedBookUrl: string,
  encodedSourceUrl?: string,
  encodedChapterUrl?: string,
): Promise<ReaderState> {
  const state = createInitialState();
  state.bookUrl = decodeURIComponent(encodedBookUrl);
  state.sourceUrl = encodedSourceUrl ? decodeURIComponent(encodedSourceUrl) : "";
  state.colorModePreference = getColorModePreference();

  const isLocalEpub = state.bookUrl.startsWith("local://epub/");

  if (!state.sourceUrl) {
    try {
      const book = await getBook(state.bookUrl);
      if (book) {
        state.sourceUrl = book.source_url;
      }
    } catch {
    }
  }

  const savedProgress = await getReadingProgress(state.bookUrl);
  if (savedProgress) {
    state.currentChapterIndex = savedProgress.chapter_index;
    state.currentOffset = savedProgress.offset;
  }

  await loadReaderStyle(state);
  await loadBookmarks(state);

  if (isLocalEpub) {
    try {
      state.chapters = await getEpubToc(state.bookUrl);
    } catch {
      state.chapters = [];
    }
  } else {
    try {
      state.bookInfo = await fetchBookInfo(state.bookUrl, state.sourceUrl);
      state.chapters = await fetchToc(state.bookUrl, state.sourceUrl);
      if (encodedChapterUrl) {
        const chapterUrl = decodeURIComponent(encodedChapterUrl);
        const currentIndex = state.chapters.findIndex((chapter) => chapter.url === chapterUrl);
        if (currentIndex >= 0) {
          state.currentChapterIndex = currentIndex;
        }
      }
    } catch {
      state.bookInfo = { name: "未知书籍", author: "未知作者" };
      state.chapters = [];
    }
  }

  return state;
}

function restoreScrollOffset(readerBody: HTMLElement, offset: number): void {
  if (offset <= 0) {
    readerBody.scrollTop = 0;
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const maxOffset = Math.max(0, readerBody.scrollHeight - readerBody.clientHeight);
      readerBody.scrollTop = Math.min(offset, maxOffset);
    });
  });
}

function clearChapterHighlights(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("mark.reader-search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

function markChapterSearch(
  article: HTMLElement,
  query: string,
  matchIndex: number,
  readerBody: HTMLElement | null,
): number {
  clearChapterHighlights(article);
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const lowerQuery = trimmed.toLocaleLowerCase();
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.toLocaleLowerCase().includes(lowerQuery)) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (parent?.closest("mark.reader-search-hit")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (textNodes.length < 500) {
    const node = walker.nextNode();
    if (!node) break;
    textNodes.push(node as Text);
  }

  let count = 0;
  textNodes.forEach((node) => {
    const text = node.nodeValue ?? "";
    const fragment = document.createDocumentFragment();
    let position = 0;
    let searchFrom = 0;
    while (true) {
      const index = text.toLocaleLowerCase().indexOf(lowerQuery, searchFrom);
      if (index < 0) break;
      if (index > position) {
        fragment.appendChild(document.createTextNode(text.slice(position, index)));
      }
      const mark = document.createElement("mark");
      mark.className = "reader-search-hit";
      mark.textContent = text.slice(index, index + trimmed.length);
      fragment.appendChild(mark);
      count += 1;
      position = index + trimmed.length;
      searchFrom = position;
    }
    if (position < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(position)));
    }
    node.parentNode?.replaceChild(fragment, node);
  });

  const matches = article.querySelectorAll<HTMLElement>("mark.reader-search-hit");
  const current = matches[matchIndex];
  matches.forEach((el, index) => {
    el.classList.toggle("current", index === matchIndex);
  });
  if (current && readerBody) {
    const targetTop = current.offsetTop - readerBody.clientHeight * 0.25;
    readerBody.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }

  return count;
}

function BookmarkList({
  bookmarks,
  onSelect,
  onDelete,
}: {
  bookmarks: Bookmark[];
  onSelect: (bookmark: Bookmark) => void;
  onDelete: (index: number) => void;
}) {
  if (bookmarks.length === 0) {
    return <li className="no-bookmarks">暂无书签</li>;
  }

  return bookmarks.map((bookmark, index) => {
    const position = bookmark.offset > 0 ? ` · 位置 ${bookmark.offset}` : "";
    return (
      <li className="bookmark-item" key={`${bookmark.page}-${bookmark.offset}-${index}`} onClick={() => onSelect(bookmark)}>
        <span className="bookmark-page">第{bookmark.page + 1}章{position}</span>
        <span className="bookmark-content-text">{bookmark.content || "无描述"}</span>
        <button
          className="bookmark-delete"
          type="button"
          title="删除"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(index);
          }}
        >
          &#x2715;
        </button>
      </li>
    );
  });
}

export function ReaderPage({
  bookUrl,
  sourceUrl,
  chapterUrl,
}: {
  bookUrl: string;
  sourceUrl?: string;
  chapterUrl?: string;
}) {
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [chapterState, setChapterState] = useState<ChapterLoadState>({
    status: "loading",
    html: "",
    error: "",
  });
  const [tocSearch, setTocSearch] = useState("");
  const [tocJump, setTocJump] = useState("");
  const stateRef = useRef<ReaderState | null>(null);
  const readerBodyRef = useRef<HTMLElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const progressSaveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setReaderState(null);
    setChapterState({ status: "loading", html: "", error: "" });

    loadReaderState(bookUrl, sourceUrl, chapterUrl)
      .then((state) => {
        if (!cancelled) {
          stateRef.current = state;
          setReaderState({ ...state });
        }
      })
      .catch(() => {
        if (!cancelled) {
          const state = createInitialState();
          state.bookUrl = decodeURIComponent(bookUrl);
          state.bookInfo = { name: "未知书籍", author: "未知作者" };
          stateRef.current = state;
          setReaderState(state);
        }
      });

    return () => {
      cancelled = true;
      if (progressSaveTimer.current !== undefined) {
        window.clearTimeout(progressSaveTimer.current);
        progressSaveTimer.current = undefined;
      }
    };
  }, [bookUrl, sourceUrl, chapterUrl]);

  useEffect(() => {
    if (!readerState) return;
    stateRef.current = readerState;
  }, [readerState]);

  useEffect(() => {
    if (!readerState) return;
    applyReaderStyle(readerState);
    applyReaderStyleToContent(readerState);
  }, [readerState?.fontFamily, readerState?.fontSize, readerState?.lineHeight, readerState?.theme]);

  useEffect(() => {
    if (!readerState) return;
    let cancelled = false;
    const snapshot = { ...readerState, chapters: [...readerState.chapters] };
    const chapter = snapshot.chapters[snapshot.currentChapterIndex];

    if (!chapter) {
      setChapterState({ status: "error", html: "", error: "加载章节失败" });
      return;
    }

    setChapterState({ status: "loading", html: "", error: "" });
    readChapterContent(snapshot, snapshot.currentChapterIndex)
      .then((content) => {
        if (cancelled) return;
        setChapterState({
          status: "ready",
          html: convertChineseScript(content, snapshot.chineseScript),
          error: "",
        });
        requestAnimationFrame(() => {
          const body = readerBodyRef.current;
          if (body) {
            restoreScrollOffset(body, snapshot.currentOffset);
          }
        });
        void saveCurrentReadingProgress(snapshot);

        const nextIndex = snapshot.currentChapterIndex + 1;
        if (nextIndex < snapshot.chapters.length) {
          void readChapterContent(snapshot, nextIndex).catch(() => {
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setChapterState({
            status: "error",
            html: "",
            error: `加载内容失败: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    readerState?.bookUrl,
    readerState?.sourceUrl,
    readerState?.currentChapterIndex,
    readerState?.chineseScript,
    readerState?.chapters,
  ]);

  useEffect(() => {
    if (!readerState || chapterState.status !== "ready") return;
    const article = articleRef.current;
    if (!article) return;
    const count = markChapterSearch(
      article,
      readerState.searchQuery,
      Math.min(readerState.searchMatchIndex, Math.max(0, readerState.searchMatchCount - 1)),
      readerBodyRef.current,
    );
    if (count !== readerState.searchMatchCount) {
      setReaderState({ ...readerState, searchMatchCount: count, searchMatchIndex: 0 });
    }
  }, [readerState?.searchQuery, readerState?.searchMatchIndex, chapterState.html, chapterState.status]);

  const scheduleProgressSave = useCallback((state: ReaderState) => {
    if (progressSaveTimer.current !== undefined) {
      window.clearTimeout(progressSaveTimer.current);
    }
    progressSaveTimer.current = window.setTimeout(() => {
      progressSaveTimer.current = undefined;
      void saveCurrentReadingProgress(state);
    }, 500);
  }, []);

  const updateReaderState = useCallback((updater: (state: ReaderState) => ReaderState) => {
    setReaderState((current) => {
      if (!current) return current;
      const next = updater(current);
      stateRef.current = next;
      return next;
    });
  }, []);

  const goToChapter = useCallback(async (chapterIndex: number, offset = 0) => {
    const current = stateRef.current;
    if (!current || chapterIndex < 0 || chapterIndex >= current.chapters.length) return;
    const body = readerBodyRef.current;
    if (body) {
      current.currentOffset = body.scrollTop;
      await saveCurrentReadingProgress(current);
    }
    updateReaderState((state) => ({
      ...state,
      currentChapterIndex: chapterIndex,
      currentOffset: Math.max(0, Math.round(offset)),
      showToc: false,
      showBookmarks: false,
      searchMatchIndex: 0,
      searchMatchCount: 0,
    }));
  }, [updateReaderState]);

  const filteredToc = useMemo(() => {
    if (!readerState) return [];
    const query = tocSearch.trim().toLocaleLowerCase();
    return readerState.chapters.map((chapter, index) => {
      const chapterNumber = String(index + 1);
      const matches = !query
        || chapter.title.toLocaleLowerCase().includes(query)
        || chapterNumber.includes(query);
      return { chapter, index, matches };
    });
  }, [readerState, tocSearch]);

  if (!readerState) {
    return (
      <div className="page page-reader">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  const chapters = readerState.chapters;
  const currentChapter = chapters[readerState.currentChapterIndex];
  const currentChapterTitle = currentChapter?.title ?? "未选择章节";
  const currentChapterPosition = chapters.length > 0
    ? `${readerState.currentChapterIndex + 1} / ${chapters.length}`
    : "0 / 0";
  const autoNumber = shouldAutoNumber(chapters);
  const searchCountText = readerState.searchMatchCount === 0
    ? "0 / 0"
    : `${readerState.searchMatchIndex + 1} / ${readerState.searchMatchCount}`;

  function setPanel(panel: "toc" | "settings" | "bookmarks", open?: boolean) {
    updateReaderState((state) => {
      const currentOpen =
        panel === "toc" ? state.showToc : panel === "settings" ? state.showSettings : state.showBookmarks;
      const nextOpen = open ?? !currentOpen;
      return {
        ...state,
        showToc: panel === "toc" ? Boolean(nextOpen) : false,
        showSettings: panel === "settings" ? Boolean(nextOpen) : false,
        showBookmarks: panel === "bookmarks" ? Boolean(nextOpen) : false,
      };
    });
  }

  function closePanels() {
    updateReaderState((state) => ({
      ...state,
      showToc: false,
      showSettings: false,
      showBookmarks: false,
    }));
  }

  async function saveStyle(next: ReaderState) {
    applyReaderStyle(next);
    applyReaderStyleToContent(next);
    await saveReaderStyleSettings(next);
  }

  function changeTheme(theme: Theme) {
    const current = stateRef.current;
    if (!current) return;
    const next: ReaderState = { ...current, theme };
    themeManager.setTheme(theme);
    setReaderState(next);
    stateRef.current = next;
    void saveStyle(next);
  }

  function changeColorMode(colorModePreference: ColorModePreference) {
    setColorMode(colorModePreference);
    updateReaderState((state) => ({ ...state, colorModePreference }));
  }

  function selectSearchMatch(direction: number) {
    const current = stateRef.current;
    if (!current || current.searchMatchCount === 0) return;
    updateReaderState((state) => ({
      ...state,
      searchMatchIndex: (state.searchMatchIndex + direction + state.searchMatchCount) % state.searchMatchCount,
    }));
  }

  function jumpToRequestedChapter() {
    const requested = Number(tocJump);
    const targetIndex = requested - 1;
    if (!Number.isInteger(requested) || targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }
    void goToChapter(targetIndex);
  }

  async function refreshBookmarks(mutator: (state: ReaderState) => Promise<void>) {
    const current = stateRef.current;
    if (!current) return;
    if (readerBodyRef.current) {
      current.currentOffset = readerBodyRef.current.scrollTop;
    }
    await mutator(current);
    setReaderState({ ...current, bookmarks: [...current.bookmarks] });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const activeTag = document.activeElement?.tagName;
    if (activeTag === "INPUT" || activeTag === "SELECT") return;
    const current = stateRef.current;
    if (!current) return;

    switch (event.key) {
      case "ArrowLeft":
      case "h":
        void goToChapter(current.currentChapterIndex - 1);
        break;
      case "ArrowRight":
      case "l":
        void goToChapter(current.currentChapterIndex + 1);
        break;
      case "t":
        setPanel("toc");
        break;
      case "b":
        setPanel("bookmarks");
        break;
      case "s":
        setPanel("settings");
        break;
      case "m":
        void refreshBookmarks((state) => saveCurrentBookmark(state));
        break;
      case "+":
      case "=": {
        const fontSize = Math.min(32, current.fontSize + 2);
        const next: ReaderState = { ...current, fontSize };
        setReaderState(next);
        stateRef.current = next;
        void saveStyle(next);
        break;
      }
      case "-": {
        const fontSize = Math.max(12, current.fontSize - 2);
        const next: ReaderState = { ...current, fontSize };
        setReaderState(next);
        stateRef.current = next;
        void saveStyle(next);
        break;
      }
      case "Home":
        void goToChapter(0);
        break;
      case "g":
        if (event.shiftKey) {
          void goToChapter(0);
        }
        break;
      case "End":
        void goToChapter(chapters.length - 1);
        break;
    }
  }

  return (
    <div
      className={`page page-reader theme-${readerState.theme}`}
      style={createReaderStyle(readerState)}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="reader-header">
        <button
          className="btn-icon"
          type="button"
          title="返回"
          onClick={() => {
            if (readerBodyRef.current) {
              readerState.currentOffset = readerBodyRef.current.scrollTop;
              void saveCurrentReadingProgress(readerState);
            }
            navigate("/");
          }}
        >
          &#x2190;
        </button>
        <button className="btn-icon" type="button" title="目录" disabled={chapters.length === 0} onClick={() => setPanel("toc")}>&#x2630;</button>
        <button className="btn-icon" type="button" title="书签" onClick={() => setPanel("bookmarks")}>&#x1f516;</button>
        <div className="reader-title-group">
          <h1 className="reader-title">{readerState.bookInfo?.name ?? ""}</h1>
          <span className="reader-current-chapter" title={currentChapterTitle}>{currentChapterTitle}</span>
        </div>
        <button className="btn-icon" type="button" title="设置" onClick={() => setPanel("settings")}>&#x2699;</button>
      </header>

      <div className="reader-searchbar">
        <input
          type="search"
          placeholder="搜索当前章节"
          value={readerState.searchQuery}
          onChange={(event) => updateReaderState((state) => ({
            ...state,
            searchQuery: event.target.value,
            searchMatchIndex: 0,
          }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              selectSearchMatch(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <button className="btn-icon" type="button" title="上一个匹配" onClick={() => selectSearchMatch(-1)}>&#x2191;</button>
        <button className="btn-icon" type="button" title="下一个匹配" onClick={() => selectSearchMatch(1)}>&#x2193;</button>
        <span className="chapter-search-count">{searchCountText}</span>
      </div>

      <main
        className="reader-body"
        ref={readerBodyRef}
        onClick={closePanels}
        onScroll={(event) => {
          const offset = event.currentTarget.scrollTop;
          readerState.currentOffset = offset;
          scheduleProgressSave({ ...readerState, currentOffset: offset });
        }}
      >
        {chapterState.status === "loading" ? <div className="loading">加载中...</div> : null}
        {chapterState.status === "error" ? <div className="error-msg">{chapterState.error}</div> : null}
        {chapterState.status === "ready" ? (
          <article
            className="chapter-content"
            ref={articleRef}
            dangerouslySetInnerHTML={{ __html: chapterState.html }}
          />
        ) : null}
      </main>

      {chapters.length > 0 ? (
        <nav className={`reader-toc ${readerState.showToc ? "" : "hidden"}`}>
          <div className="toc-header">
            <h2>目录</h2>
            <button className="btn-icon" type="button" onClick={() => setPanel("toc", false)}>&#x2715;</button>
          </div>
          <div className="toc-current">
            <span className="toc-current-label">当前章节</span>
            <span className="toc-current-position">{currentChapterPosition}</span>
            <strong className="toc-current-title">{currentChapterTitle}</strong>
          </div>
          <div className="toc-tools">
            <input
              type="search"
              placeholder="搜索章节或编号"
              value={tocSearch}
              onChange={(event) => setTocSearch(event.target.value)}
            />
            <div className="toc-jump">
              <input
                type="number"
                min="1"
                max={chapters.length}
                placeholder="章节"
                value={tocJump}
                onChange={(event) => setTocJump(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    jumpToRequestedChapter();
                  }
                }}
              />
              <button className="ctrl-btn" type="button" onClick={jumpToRequestedChapter}>跳转</button>
            </div>
          </div>
          <ul className="toc-list">
            {filteredToc.map(({ chapter, index, matches }) => (
              <li
                className={`toc-item ${index === readerState.currentChapterIndex ? "active" : ""} ${matches ? "" : "hidden"}`}
                key={`${chapter.url}-${index}`}
                aria-current={index === readerState.currentChapterIndex ? "true" : undefined}
                onClick={() => void goToChapter(index)}
              >
                {autoNumber ? `第${index + 1}章 ` : ""}{chapter.title}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className={`reader-bookmarks ${readerState.showBookmarks ? "" : "hidden"}`}>
        <div className="bookmarks-header">
          <h2>书签</h2>
          <button className="btn-icon" type="button" onClick={() => setPanel("bookmarks", false)}>&#x2715;</button>
        </div>
        <button
          className="btn-save-bookmark"
          type="button"
          onClick={() => void refreshBookmarks((state) => saveCurrentBookmark(state))}
        >
          保存当前书签
        </button>
        <ul className="bookmark-list">
          <BookmarkList
            bookmarks={readerState.bookmarks}
            onSelect={(bookmark) => void goToChapter(bookmark.page, bookmark.offset)}
            onDelete={(index) => void refreshBookmarks((state) => deleteBookmark(state, index))}
          />
        </ul>
      </div>

      <div className="reader-controls">
        <button className="ctrl-btn" type="button" disabled={readerState.currentChapterIndex === 0} onClick={() => void goToChapter(readerState.currentChapterIndex - 1)}>上一章</button>
        <span className="chapter-indicator">{currentChapterPosition}</span>
        <button className="ctrl-btn" type="button" disabled={readerState.currentChapterIndex >= chapters.length - 1} onClick={() => void goToChapter(readerState.currentChapterIndex + 1)}>下一章</button>
      </div>

      <div className={`reader-settings-panel ${readerState.showSettings ? "" : "hidden"}`}>
        <div className="setting-row">
          <label>字号</label>
          <input
            type="range"
            min="12"
            max="28"
            value={readerState.fontSize}
            onChange={(event) => {
              const next = { ...readerState, fontSize: Number.parseInt(event.target.value, 10) };
              setReaderState(next);
              stateRef.current = next;
            }}
            onMouseUp={() => {
              if (stateRef.current) void saveStyle(stateRef.current);
            }}
            onTouchEnd={() => {
              if (stateRef.current) void saveStyle(stateRef.current);
            }}
          />
          <span>{readerState.fontSize}px</span>
        </div>
        <div className="setting-row">
          <label>行距</label>
          <input
            type="range"
            min="1.2"
            max="2.4"
            step="0.1"
            value={readerState.lineHeight}
            onChange={(event) => {
              const next = { ...readerState, lineHeight: Number.parseFloat(event.target.value) };
              setReaderState(next);
              stateRef.current = next;
            }}
            onMouseUp={() => {
              if (stateRef.current) void saveStyle(stateRef.current);
            }}
            onTouchEnd={() => {
              if (stateRef.current) void saveStyle(stateRef.current);
            }}
          />
          <span>{readerState.lineHeight}</span>
        </div>
        <div className="setting-row">
          <label>阅读背景</label>
          <div className="theme-selector">
            {(["light", "dark", "sepia"] as Theme[]).map((theme) => (
              <button
                className={`theme-btn ${readerState.theme === theme ? "active" : ""}`}
                type="button"
                key={theme}
                onClick={() => changeTheme(theme)}
              >
                {theme === "light" ? "浅色" : theme === "dark" ? "深色" : "护眼"}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <label>显示模式</label>
          <div className="theme-selector">
            {([
              ["system", "跟随系统"],
              ["light", "浅色"],
              ["dark", "深色"],
            ] as Array<[ColorModePreference, string]>).map(([mode, label]) => (
              <button
                className={`theme-btn ${readerState.colorModePreference === mode ? "active" : ""}`}
                type="button"
                key={mode}
                onClick={() => changeColorMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <label>字体</label>
          <select
            className="font-selector"
            value={readerState.fontFamily}
            onChange={(event) => {
              const next = { ...readerState, fontFamily: event.target.value };
              setReaderState(next);
              stateRef.current = next;
              void saveStyle(next);
            }}
          >
            <option value="Noto Serif">Noto Serif</option>
            <option value="Noto Sans">Noto Sans</option>
            <option value="System UI">System UI</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans Serif</option>
          </select>
        </div>
        <div className="setting-row">
          <label>字形</label>
          <div className="theme-selector">
            {([
              ["original", "原文"],
              ["simplified", "简体"],
              ["traditional", "繁體"],
            ] as Array<[ChineseScript, string]>).map(([script, label]) => (
              <button
                className={`theme-btn ${readerState.chineseScript === script ? "active" : ""}`}
                type="button"
                key={script}
                onClick={() => updateReaderState((state) => ({ ...state, chineseScript: script }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
