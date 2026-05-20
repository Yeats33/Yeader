import type { ReaderState } from "./types.ts";
import { resolveEpubImages } from "../../reader/imageResolver.ts";

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

export async function readChapterContent(state: ReaderState, chapterIndex: number): Promise<string> {
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

export function resetReaderChapterCache(): void {
  chapterCache.clear();
  pendingChapterLoads.clear();
}

export function getCachedChapterCount(): number {
  return chapterCache.size;
}
