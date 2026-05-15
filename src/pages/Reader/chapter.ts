import type { ReaderState } from "./types.ts";
import { resolveEpubImages } from "../../reader/imageResolver.ts";

export async function loadCurrentChapter(
  container: HTMLElement,
  state: ReaderState,
): Promise<void> {
  const { fetchContent, readLocalEpub, saveReadingProgress } = await import("../../api.ts");
  const { applyReaderStyleToContent } = await import("./style.ts");

  const readerBody = container.querySelector<HTMLElement>("#reader-body");
  const prevBtn = container.querySelector<HTMLButtonElement>("#prev-chapter");
  const nextBtn = container.querySelector<HTMLButtonElement>("#next-chapter");
  const indicator = container.querySelector<HTMLElement>(".chapter-indicator");
  const tocItems = container.querySelectorAll<HTMLElement>(".toc-item");

  if (!readerBody) return;

  const chapter = state.chapters[state.currentChapterIndex];
  if (!chapter) {
    readerBody.innerHTML = '<div class="error-msg">加载章节失败</div>';
    return;
  }

  readerBody.innerHTML = '<div class="loading">加载中...</div>';

  try {
    let content: string;
    let epubBasePath = "";
    if (state.bookUrl.startsWith("local://epub/")) {
      content = await readLocalEpub(state.bookUrl, state.currentChapterIndex);
      epubBasePath = state.bookUrl.replace("local://epub/", "");
    } else {
      content = await fetchContent(chapter.url, state.sourceUrl);
    }

    // Resolve image paths for EPUB content or proxy HTTP images
    if (state.bookUrl.startsWith("local://epub/")) {
      content = await resolveEpubImages(content, epubBasePath);
    }

    readerBody.innerHTML = `<article class="chapter-content">${content}</article>`;
    applyReaderStyleToContent(state);
  } catch (e) {
    console.error("[Reader] fetchContent failed:", chapter.url, e);
    readerBody.innerHTML = `<div class="error-msg">加载内容失败: ${e instanceof Error ? e.message : String(e)}</div>`;
  }

  tocItems.forEach((el) => {
    const idx = parseInt(el.dataset.chapter!);
    el.classList.toggle("active", idx === state.currentChapterIndex);
  });

  if (prevBtn) prevBtn.disabled = state.currentChapterIndex === 0;
  if (nextBtn) nextBtn.disabled = state.currentChapterIndex >= state.chapters.length - 1;
  if (indicator) indicator.textContent = `${state.currentChapterIndex + 1} / ${state.chapters.length || 1}`;

  await saveReadingProgress({
    book_id: state.bookUrl,
    chapter_index: state.currentChapterIndex,
    chapter_title: chapter.title ?? "",
    offset: 0,
  });
}