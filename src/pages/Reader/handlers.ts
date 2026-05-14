import type { ReaderState } from "./types.ts";
import type { Theme } from "../../utils/themeManager";

export async function initReaderHandlers(
  container: HTMLElement,
  state: ReaderState,
  loadCurrentChapter: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const { navigate } = await import("../../router.ts");
  const { themeManager } = await import("../../utils/themeManager");
  const { applyReaderStyle, applyReaderStyleToContent, saveReaderStyleSettings } = await import("./style.ts");
  const { saveCurrentBookmark, deleteBookmark } = await import("./bookmarks.ts");

  // Query elements
  const tocEl = container.querySelector<HTMLElement>("#reader-toc");
  const tocCloseBtn = container.querySelector<HTMLButtonElement>("#toc-close");
  const tocBtn = container.querySelector<HTMLButtonElement>("#reader-toc-btn");
  const readerBody = container.querySelector<HTMLElement>("#reader-body");
  const settingsPanel = container.querySelector<HTMLElement>("#reader-settings");
  const settingsBtn = container.querySelector<HTMLButtonElement>("#reader-settings-btn");
  const fontSizeSlider = container.querySelector<HTMLInputElement>("#font-size-slider");
  const fontSizeVal = container.querySelector<HTMLElement>("#font-size-val");
  const lineHeightSlider = container.querySelector<HTMLInputElement>("#line-height-slider");
  const lineHeightVal = container.querySelector<HTMLElement>("#line-height-val");
  const prevBtn = container.querySelector<HTMLButtonElement>("#prev-chapter");
  const nextBtn = container.querySelector<HTMLButtonElement>("#next-chapter");
  const bookmarksBtn = container.querySelector<HTMLButtonElement>("#reader-bookmarks-btn");
  const bookmarksPanel = container.querySelector<HTMLElement>("#reader-bookmarks");
  const bookmarksCloseBtn = container.querySelector<HTMLButtonElement>("#bookmarks-close");
  const saveBookmarkBtn = container.querySelector<HTMLButtonElement>("#save-bookmark-btn");
  const themeBtns = container.querySelectorAll<HTMLButtonElement>(".theme-btn");
  const fontFamilySelect = container.querySelector<HTMLSelectElement>("#font-family-select");

  // Navigation
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav!));
  });

  // TOC toggle
  tocCloseBtn?.addEventListener("click", () => {
    state.showToc = false;
    tocEl?.classList.add("hidden");
  });

  tocBtn?.addEventListener("click", () => {
    state.showToc = !state.showToc;
    tocEl?.classList.toggle("hidden", !state.showToc);
  });

  // Settings toggle
  settingsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.showSettings = !state.showSettings;
    settingsPanel?.classList.toggle("hidden", !state.showSettings);
  });

  // Body click toggles panels
  readerBody?.addEventListener("click", () => {
    if (state.showToc) {
      state.showToc = false;
      tocEl?.classList.add("hidden");
    } else if (state.showSettings) {
      state.showSettings = false;
      settingsPanel?.classList.add("hidden");
    } else if (state.showBookmarks) {
      state.showBookmarks = false;
      bookmarksPanel?.classList.add("hidden");
    }
  });

  // Font size slider
  fontSizeSlider?.addEventListener("input", () => {
    state.fontSize = parseInt(fontSizeSlider.value);
    document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
    if (fontSizeVal) fontSizeVal.textContent = `${state.fontSize}px`;
  });

  fontSizeSlider?.addEventListener("change", () => {
    saveReaderStyleSettings(state);
    applyReaderStyleToContent(state);
  });

  // Line height slider
  lineHeightSlider?.addEventListener("input", () => {
    state.lineHeight = parseFloat(lineHeightSlider.value);
    document.documentElement.style.setProperty("--line-height", `${state.lineHeight}`);
    if (lineHeightVal) lineHeightVal.textContent = String(state.lineHeight);
  });

  lineHeightSlider?.addEventListener("change", () => {
    saveReaderStyleSettings(state);
    applyReaderStyleToContent(state);
  });

  // Theme buttons
  themeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const newTheme = btn.dataset.theme as Theme;
      if (newTheme) {
        state.theme = newTheme;
        themeManager.setTheme(newTheme);
        const pageEl = document.querySelector(".page-reader");
        if (pageEl) {
          pageEl.className = pageEl.className.replace(/theme-\w+/g, "");
          pageEl.classList.add(`theme-${newTheme}`);
        }
        themeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        saveReaderStyleSettings(state);
        applyReaderStyleToContent(state);
      }
    });
  });

  // Font family select
  fontFamilySelect?.addEventListener("change", () => {
    state.fontFamily = fontFamilySelect.value;
    applyReaderStyle(state);
    saveReaderStyleSettings(state);
    applyReaderStyleToContent(state);
  });

  // Navigation buttons
  prevBtn?.addEventListener("click", () => {
    if (state.currentChapterIndex > 0) {
      state.currentChapterIndex--;
      loadCurrentChapter(container);
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (state.currentChapterIndex < state.chapters.length - 1) {
      state.currentChapterIndex++;
      loadCurrentChapter(container);
    }
  });

  // TOC items
  container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.chapter!);
      state.currentChapterIndex = idx;
      state.showToc = false;
      tocEl?.classList.add("hidden");
      loadCurrentChapter(container);
    });
  });

  // Bookmarks
  bookmarksBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.showBookmarks = !state.showBookmarks;
    bookmarksPanel?.classList.toggle("hidden", !state.showBookmarks);
  });

  bookmarksCloseBtn?.addEventListener("click", () => {
    state.showBookmarks = false;
    bookmarksPanel?.classList.add("hidden");
  });

  saveBookmarkBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    saveCurrentBookmark(state);
  });

  container.querySelectorAll<HTMLElement>(".bookmark-delete").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = parseInt(el.dataset.index!);
      deleteBookmark(state, index);
    });
  });

  container.querySelectorAll<HTMLElement>(".bookmark-item").forEach((el) => {
    el.addEventListener("click", () => {
      const index = parseInt(el.dataset.index!);
      const bookmark = state.bookmarks[index];
      if (bookmark) {
        state.currentChapterIndex = bookmark.page;
        state.showBookmarks = false;
        bookmarksPanel?.classList.add("hidden");
        loadCurrentChapter(container);
      }
    });
  });

  // Keyboard shortcuts
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;

    switch (e.key) {
      case "ArrowLeft":
      case "h":
        if (state.currentChapterIndex > 0) {
          state.currentChapterIndex--;
          loadCurrentChapter(container);
        }
        break;
      case "ArrowRight":
      case "l":
        if (state.currentChapterIndex < state.chapters.length - 1) {
          state.currentChapterIndex++;
          loadCurrentChapter(container);
        }
        break;
      case "t":
        state.showToc = !state.showToc;
        tocEl?.classList.toggle("hidden", !state.showToc);
        break;
      case "b":
        state.showBookmarks = !state.showBookmarks;
        bookmarksPanel?.classList.toggle("hidden", !state.showBookmarks);
        break;
      case "s":
        state.showSettings = !state.showSettings;
        settingsPanel?.classList.toggle("hidden", !state.showSettings);
        break;
      case "m":
        saveCurrentBookmark(state);
        break;
      case "+":
      case "=":
        if (state.fontSize < 32) {
          state.fontSize += 2;
          document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
          if (fontSizeSlider) fontSizeSlider.value = String(state.fontSize);
          if (fontSizeVal) fontSizeVal.textContent = `${state.fontSize}px`;
          saveReaderStyleSettings(state);
        }
        break;
      case "-":
        if (state.fontSize > 12) {
          state.fontSize -= 2;
          document.documentElement.style.setProperty("--font-size", `${state.fontSize}px`);
          if (fontSizeSlider) fontSizeSlider.value = String(state.fontSize);
          if (fontSizeVal) fontSizeVal.textContent = `${state.fontSize}px`;
          saveReaderStyleSettings(state);
        }
        break;
      case "Home":
      case "g":
        if (e.key === "g" && !e.shiftKey) break;
        state.currentChapterIndex = 0;
        loadCurrentChapter(container);
        break;
      case "End":
        state.currentChapterIndex = state.chapters.length - 1;
        loadCurrentChapter(container);
        break;
    }
  });

  await loadCurrentChapter(container);
}