import type { ReaderState } from "./types.ts";
import type { Theme } from "../../utils/themeManager";
import type { ChineseScript } from "../../utils/chineseConvert.ts";
import type { ColorModePreference } from "../../theme.ts";

export async function initReaderHandlers(
  container: HTMLElement,
  state: ReaderState,
  loadCurrentChapter: (container: HTMLElement) => Promise<void>,
): Promise<void> {
  const { navigate } = await import("../../router.ts");
  const { themeManager } = await import("../../utils/themeManager");
  const { setColorMode } = await import("../../theme.ts");
  const { applyReaderStyle, applyReaderStyleToContent, saveReaderStyleSettings } = await import("./style.ts");
  const { saveCurrentBookmark, deleteBookmark } = await import("./bookmarks.ts");
  const { saveCurrentReadingProgress } = await import("./chapter.ts");
  const { renderBookmarkListItems } = await import("./render.ts");
  let progressSaveTimer: number | undefined;

  const scheduleProgressSave = () => {
    if (progressSaveTimer !== undefined) {
      window.clearTimeout(progressSaveTimer);
    }
    progressSaveTimer = window.setTimeout(() => {
      progressSaveTimer = undefined;
      saveCurrentReadingProgress(state).catch(() => {
      });
    }, 500);
  };

  const flushProgressSave = async (): Promise<void> => {
    if (progressSaveTimer !== undefined) {
      window.clearTimeout(progressSaveTimer);
      progressSaveTimer = undefined;
    }
    await saveCurrentReadingProgress(state);
  };

  const goToChapter = async (chapterIndex: number, offset = 0): Promise<void> => {
    if (chapterIndex < 0 || chapterIndex >= state.chapters.length) return;
    if (readerBody) {
      state.currentOffset = readerBody.scrollTop;
      await flushProgressSave();
    }
    state.currentChapterIndex = chapterIndex;
    state.currentOffset = Math.max(0, Math.round(offset));
    await loadCurrentChapter(container);
    updateChapterSearch();
  };

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
  const colorModeBtns = container.querySelectorAll<HTMLButtonElement>("[data-color-mode]");
  const fontFamilySelect = container.querySelector<HTMLSelectElement>("#font-family-select");
  const tocSearchInput = container.querySelector<HTMLInputElement>("#toc-search-input");
  const tocJumpInput = container.querySelector<HTMLInputElement>("#toc-jump-input");
  const tocJumpBtn = container.querySelector<HTMLButtonElement>("#toc-jump-btn");
  const chapterSearchInput = container.querySelector<HTMLInputElement>("#chapter-search-input");
  const chapterSearchPrev = container.querySelector<HTMLButtonElement>("#chapter-search-prev");
  const chapterSearchNext = container.querySelector<HTMLButtonElement>("#chapter-search-next");
  const chapterSearchCount = container.querySelector<HTMLElement>("#chapter-search-count");
  let chapterSearchTimer: number | undefined;

  const attachBookmarkItemHandlers = () => {
    container.querySelectorAll<HTMLElement>(".bookmark-delete").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const index = parseInt(el.dataset.index!);
        await deleteBookmark(state, index);
        refreshBookmarkList();
      });
    });

    container.querySelectorAll<HTMLElement>(".bookmark-item").forEach((el) => {
      el.addEventListener("click", () => {
        const index = parseInt(el.dataset.index!);
        const bookmark = state.bookmarks[index];
        if (bookmark) {
          state.showBookmarks = false;
          bookmarksPanel?.classList.add("hidden");
          goToChapter(bookmark.page, bookmark.offset);
        }
      });
    });
  };

  const refreshBookmarkList = () => {
    const list = container.querySelector<HTMLElement>(".bookmark-list");
    if (!list) return;
    list.innerHTML = renderBookmarkListItems(state);
    attachBookmarkItemHandlers();
  };

  const scrollCurrentTocItemIntoView = () => {
    const currentItem = container.querySelector<HTMLElement>(
      `.toc-item[data-chapter="${state.currentChapterIndex}"]`,
    );
    if (!currentItem || currentItem.classList.contains("hidden")) return;
    requestAnimationFrame(() => {
      currentItem.scrollIntoView({ block: "center" });
    });
  };

  const updateChapterSearchCount = () => {
    if (!chapterSearchCount) return;
    chapterSearchCount.textContent = state.searchMatchCount === 0
      ? "0 / 0"
      : `${state.searchMatchIndex + 1} / ${state.searchMatchCount}`;
  };

  const clearChapterHighlights = () => {
    container.querySelectorAll<HTMLElement>("mark.reader-search-hit").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    });
  };

  const scrollToSearchMatch = () => {
    const matches = container.querySelectorAll<HTMLElement>("mark.reader-search-hit");
    const match = matches[state.searchMatchIndex];
    if (!match || !readerBody) return;
    const targetTop = match.offsetTop - readerBody.clientHeight * 0.25;
    readerBody.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    matches.forEach((el, index) => {
      el.classList.toggle("current", index === state.searchMatchIndex);
    });
  };

  const updateChapterSearch = () => {
    clearChapterHighlights();
    const query = state.searchQuery.trim();
    state.searchMatchIndex = 0;
    state.searchMatchCount = 0;
    if (!query) {
      updateChapterSearchCount();
      return;
    }

    const article = container.querySelector<HTMLElement>(".chapter-content");
    if (!article) {
      updateChapterSearchCount();
      return;
    }

    const lowerQuery = query.toLocaleLowerCase();
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
        mark.textContent = text.slice(index, index + query.length);
        fragment.appendChild(mark);
        state.searchMatchCount += 1;
        position = index + query.length;
        searchFrom = position;
      }
      if (position < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(position)));
      }
      node.parentNode?.replaceChild(fragment, node);
    });

    updateChapterSearchCount();
    scrollToSearchMatch();
  };

  const scheduleChapterSearch = () => {
    if (chapterSearchTimer !== undefined) {
      window.clearTimeout(chapterSearchTimer);
    }
    chapterSearchTimer = window.setTimeout(() => {
      chapterSearchTimer = undefined;
      updateChapterSearch();
    }, 150);
  };

  const selectSearchMatch = (direction: number) => {
    if (state.searchMatchCount === 0) return;
    state.searchMatchIndex =
      (state.searchMatchIndex + direction + state.searchMatchCount) % state.searchMatchCount;
    updateChapterSearchCount();
    scrollToSearchMatch();
  };

  // Navigation
  container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      if (readerBody) {
        state.currentOffset = readerBody.scrollTop;
        saveCurrentReadingProgress(state).catch(() => {
        });
      }
      navigate(el.dataset.nav!);
    });
  });

  // TOC toggle
  tocCloseBtn?.addEventListener("click", () => {
    state.showToc = false;
    tocEl?.classList.add("hidden");
  });

  tocBtn?.addEventListener("click", () => {
    state.showToc = !state.showToc;
    tocEl?.classList.toggle("hidden", !state.showToc);
    if (state.showToc) {
      scrollCurrentTocItemIntoView();
    }
  });

  tocSearchInput?.addEventListener("input", () => {
    const query = tocSearchInput.value.trim().toLocaleLowerCase();
    container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
      const index = Number(el.dataset.chapter ?? 0);
      const title = state.chapters[index]?.title ?? "";
      const chapterNumber = String(index + 1);
      const matches = !query
        || title.toLocaleLowerCase().includes(query)
        || chapterNumber.includes(query);
      el.classList.toggle("hidden", !matches);
    });
  });

  const jumpToRequestedChapter = () => {
    const requested = Number(tocJumpInput?.value ?? 0);
    const targetIndex = requested - 1;
    if (!Number.isInteger(requested) || targetIndex < 0 || targetIndex >= state.chapters.length) {
      return;
    }
    state.showToc = false;
    tocEl?.classList.add("hidden");
    goToChapter(targetIndex);
  };

  tocJumpBtn?.addEventListener("click", jumpToRequestedChapter);
  tocJumpInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      jumpToRequestedChapter();
    }
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

  readerBody?.addEventListener("scroll", () => {
    state.currentOffset = readerBody.scrollTop;
    scheduleProgressSave();
  }, { passive: true });

  chapterSearchInput?.addEventListener("input", () => {
    state.searchQuery = chapterSearchInput.value;
    scheduleChapterSearch();
  });

  chapterSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      selectSearchMatch(e.shiftKey ? -1 : 1);
    }
  });

  chapterSearchPrev?.addEventListener("click", () => selectSearchMatch(-1));
  chapterSearchNext?.addEventListener("click", () => selectSearchMatch(1));

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

  colorModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preference = btn.dataset.colorMode as ColorModePreference | undefined;
      if (!preference) return;
      state.colorModePreference = preference;
      setColorMode(preference);
      colorModeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Font family select
  fontFamilySelect?.addEventListener("change", () => {
    state.fontFamily = fontFamilySelect.value;
    applyReaderStyle(state);
    saveReaderStyleSettings(state);
    applyReaderStyleToContent(state);
  });

  // Chinese script toggle
  container.querySelectorAll<HTMLButtonElement>("[data-script]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const script = btn.dataset.script as ChineseScript;
      if (script && script !== state.chineseScript) {
        state.chineseScript = script;
        container.querySelectorAll<HTMLButtonElement>("[data-script]").forEach((b) => {
          b.classList.toggle("active", b.dataset.script === script);
        });
        await loadCurrentChapter(container);
        updateChapterSearch();
      }
    });
  });

  // Navigation buttons
  prevBtn?.addEventListener("click", () => {
    if (state.currentChapterIndex > 0) {
      goToChapter(state.currentChapterIndex - 1);
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (state.currentChapterIndex < state.chapters.length - 1) {
      goToChapter(state.currentChapterIndex + 1);
    }
  });

  // TOC items
  container.querySelectorAll<HTMLElement>(".toc-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.chapter!);
      state.showToc = false;
      tocEl?.classList.add("hidden");
      goToChapter(idx);
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

  saveBookmarkBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (readerBody) {
      state.currentOffset = readerBody.scrollTop;
    }
    await saveCurrentBookmark(state);
    refreshBookmarkList();
  });

  attachBookmarkItemHandlers();

  // Keyboard shortcuts
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;

    switch (e.key) {
      case "ArrowLeft":
      case "h":
        if (state.currentChapterIndex > 0) {
          goToChapter(state.currentChapterIndex - 1);
        }
        break;
      case "ArrowRight":
      case "l":
        if (state.currentChapterIndex < state.chapters.length - 1) {
          goToChapter(state.currentChapterIndex + 1);
        }
        break;
      case "t":
        state.showToc = !state.showToc;
        tocEl?.classList.toggle("hidden", !state.showToc);
        if (state.showToc) {
          scrollCurrentTocItemIntoView();
        }
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
        if (readerBody) {
          state.currentOffset = readerBody.scrollTop;
        }
        saveCurrentBookmark(state).then(refreshBookmarkList);
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
        goToChapter(0);
        break;
      case "End":
        goToChapter(state.chapters.length - 1);
        break;
    }
  });

  await loadCurrentChapter(container);
  updateChapterSearch();
}
