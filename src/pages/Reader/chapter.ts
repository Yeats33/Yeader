import type { ReaderState } from "./types.ts";
import { resolveEpubImages } from "../../reader/imageResolver.ts";
import { convertChineseScript } from "../../utils/chineseConvert.ts";

const CHAPTER_CACHE_LIMIT = 8;
const chapterCache = new Map<string, string>();
const pendingChapterLoads = new Map<string, Promise<string>>();

function getChapterCacheKey(state: ReaderState, chapterIndex: number): string {
  const chapter = state.chapters[chapterIndex];
  return [
    state.bookUrl,
    state.sourceUrl,
    String(chapterIndex),
    chapter?.url ?? "",
  ].join("|");
}

function rememberChapterContent(key: string, content: string): void {
  if (chapterCache.has(key)) {
    chapterCache.delete(key);
  }
  chapterCache.set(key, content);
  while (chapterCache.size > CHAPTER_CACHE_LIMIT) {
    const oldestKey = chapterCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    chapterCache.delete(oldestKey);
  }
}

async function readChapterContent(state: ReaderState, chapterIndex: number): Promise<string> {
  const { fetchContent, readLocalEpub } = await import("../../api.ts");
  const chapter = state.chapters[chapterIndex];
  if (!chapter) {
    throw new Error("Chapter not found");
  }

  const cacheKey = getChapterCacheKey(state, chapterIndex);
  const cached = chapterCache.get(cacheKey);
  if (cached !== undefined) {
    chapterCache.delete(cacheKey);
    chapterCache.set(cacheKey, cached);
    return cached;
  }

  const pending = pendingChapterLoads.get(cacheKey);
  if (pending) {
    return pending;
  }

  const load = (async () => {
    let content: string;
    if (state.bookUrl.startsWith("local://epub/")) {
      content = await readLocalEpub(state.bookUrl, chapterIndex);
      const epubBasePath = state.bookUrl.replace("local://epub/", "");
      content = await resolveEpubImages(content, epubBasePath);
    } else {
      content = await fetchContent(
        chapter.url,
        state.bookUrl,
        state.sourceUrl,
        chapterIndex + 1,
      );
    }
    rememberChapterContent(cacheKey, content);
    return content;
  })();

  pendingChapterLoads.set(cacheKey, load);
  try {
    return await load;
  } finally {
    pendingChapterLoads.delete(cacheKey);
  }
}

function preloadNextChapter(state: ReaderState): void {
  const nextIndex = state.currentChapterIndex + 1;
  if (nextIndex >= state.chapters.length) return;
  const cacheKey = getChapterCacheKey(state, nextIndex);
  if (chapterCache.has(cacheKey) || pendingChapterLoads.has(cacheKey)) return;
  void readChapterContent(state, nextIndex).catch(() => {
  });
}

export async function saveCurrentReadingProgress(state: ReaderState): Promise<void> {
  const { saveReadingProgress } = await import("../../api.ts");
  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) return;
  await saveReadingProgress({
    book_id: state.bookUrl,
    chapter_index: state.currentChapterIndex,
    chapter_title: chapter.title ?? "",
    offset: Math.max(0, Math.round(state.currentOffset)),
  });
}

function updateCurrentChapterChrome(container: HTMLElement, state: ReaderState): void {
  const chapter = state.chapters[state.currentChapterIndex];
  const position = state.chapters.length > 0
    ? `${state.currentChapterIndex + 1} / ${state.chapters.length}`
    : "0 / 0";

  const prevBtn = container.querySelector<HTMLButtonElement>("#prev-chapter");
  const nextBtn = container.querySelector<HTMLButtonElement>("#next-chapter");
  const indicator = container.querySelector<HTMLElement>(".chapter-indicator");
  const headerChapter = container.querySelector<HTMLElement>(".reader-current-chapter");
  const currentPosition = container.querySelector<HTMLElement>(".toc-current-position");
  const currentTitle = container.querySelector<HTMLElement>(".toc-current-title");
  const chapterTitle = chapter?.title ?? "未选择章节";

  container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
    const idx = parseInt(el.dataset.chapter!);
    const isCurrent = idx === state.currentChapterIndex;
    el.classList.toggle("active", isCurrent);
    if (isCurrent) {
      el.setAttribute("aria-current", "true");
    } else {
      el.removeAttribute("aria-current");
    }
  });

  if (prevBtn) prevBtn.disabled = state.currentChapterIndex === 0;
  if (nextBtn) nextBtn.disabled = state.currentChapterIndex >= state.chapters.length - 1;
  if (indicator) indicator.textContent = position;
  if (currentPosition) currentPosition.textContent = position;
  if (headerChapter) {
    headerChapter.textContent = chapterTitle;
    headerChapter.title = chapterTitle;
  }
  if (currentTitle) currentTitle.textContent = chapterTitle;
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

export async function loadCurrentChapter(
  container: HTMLElement,
  state: ReaderState,
): Promise<void> {
  const { applyReaderStyleToContent } = await import("./style.ts");

  const readerBody = container.querySelector<HTMLElement>("#reader-body");

  if (!readerBody) return;

  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) {
    readerBody.innerHTML = '<div class="error-msg">加载章节失败</div>';
    updateCurrentChapterChrome(container, state);
    return;
  }

  readerBody.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const content = await readChapterContent(state, state.currentChapterIndex);
    const displayContent = convertChineseScript(content, state.chineseScript);
    readerBody.innerHTML = `<article class="chapter-content">${displayContent}</article>`;
    applyReaderStyleToContent(state);
    restoreScrollOffset(readerBody, state.currentOffset);
    preloadNextChapter(state);
  } catch (e) {
    readerBody.innerHTML = `<div class="error-msg">加载内容失败: ${e instanceof Error ? e.message : String(e)}</div>`;
  }

  updateCurrentChapterChrome(container, state);

  await saveCurrentReadingProgress(state);
}

export function resetReaderChapterCache(): void {
  chapterCache.clear();
  pendingChapterLoads.clear();
}

export function getCachedChapterCount(): number {
  return chapterCache.size;
}
