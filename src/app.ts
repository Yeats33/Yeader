import { navigate, onRouteChange, getRoute, matchRoute } from "./router.ts";
import { renderBookshelfPage, initBookshelfHandlers } from "./pages/Bookshelf.ts";
import { renderSearchPage, initSearchHandlers } from "./pages/Search.ts";
import { renderReaderPage, initReader } from "./pages/Reader/index.ts";
import { renderIntegrationPage, initIntegrationPage } from "./pages/Integration.ts";
import { renderSoNovelWebuiPage, initSoNovelWebuiHandlers } from "./pages/SoNovelWebui.ts";
import { renderSoNovelConfigPage, initSoNovelConfigHandlers } from "./pages/SoNovelConfig.ts";
import { renderSoNovelRulesPage, initSoNovelRulesHandlers } from "./pages/SoNovelRules.ts";
import { renderSettingsPage, initSettingsHandlers } from "./pages/Settings.ts";
import { renderAccountPage, initAccountPage } from "./pages/Account.ts";
import { renderOnlineReaderPage, initOnlineReader } from "./pages/OnlineReader/index.ts";
import { renderOnlineChapterPage, initOnlineChapter } from "./pages/OnlineReader/chapter.ts";

type PageHandler = (container: HTMLElement) => Promise<void> | void;

const pageHandlers: Array<{
  pattern: string;
  render: () => Promise<string>;
  init?: PageHandler;
}> = [
  {
    pattern: "/",
    render: renderBookshelfPage,
    init: initBookshelfHandlers,
  },
  {
    pattern: "/search",
    render: renderSearchPage,
    init: initSearchHandlers,
  },
  {
    pattern: "/reader/:bookId",
    render: () => {
      const route = getRoute();
      const params = matchRoute("/reader/:bookId", route);
      const bookId = params?.["bookId"] ?? "";
      return renderReaderPage(bookId);
    },
    init: initReader,
  },
  {
    pattern: "/integration",
    render: async () => renderIntegrationPage(),
    init: initIntegrationPage,
  },
  {
    pattern: "/integration/so-novel/webui",
    render: async () => renderSoNovelWebuiPage(),
    init: initSoNovelWebuiHandlers,
  },
  {
    pattern: "/integration/so-novel/config",
    render: async () => renderSoNovelConfigPage(),
    init: initSoNovelConfigHandlers,
  },
  {
    pattern: "/integration/so-novel/rules",
    render: async () => renderSoNovelRulesPage(),
    init: initSoNovelRulesHandlers,
  },
  {
    pattern: "/account",
    render: renderAccountPage,
    init: initAccountPage,
  },
  {
    pattern: "/settings",
    render: renderSettingsPage,
    init: initSettingsHandlers,
  },
  {
    pattern: "/online-reader/:bookId/:sourceId",
    render: async () => {
      return renderOnlineReaderPage();
    },
    init: (container) => {
      const params = matchRoute("/online-reader/:bookId/:sourceId", getRoute());
      const bookId = params?.["bookId"] ?? "";
      const sourceId = params?.["sourceId"] ?? "";
      return initOnlineReader(container, decodeURIComponent(bookId), decodeURIComponent(sourceId));
    },
  },
  {
    pattern: "/online-reader/:bookId/:sourceId/chapter/:chapterUrl",
    render: async () => {
      return renderOnlineChapterPage();
    },
    init: (container) => {
      const params = matchRoute("/online-reader/:bookId/:sourceId/chapter/:chapterUrl", getRoute());
      const bookId = params?.["bookId"] ?? "";
      const sourceId = params?.["sourceId"] ?? "";
      const chapterUrl = params?.["chapterUrl"] ?? "";
      return initOnlineChapter(container, decodeURIComponent(bookId), decodeURIComponent(sourceId), decodeURIComponent(chapterUrl));
    },
  },
];

export async function initApp(container: HTMLElement) {
  async function renderRoute() {
    const route = getRoute();

    for (const page of pageHandlers) {
      const params = matchRoute(page.pattern, route);
      if (params !== null) {
        const html = await page.render();
        container.innerHTML = html;

        const mainContent = container.querySelector<HTMLElement>(".page");
        if (mainContent && page.init) {
          await page.init(mainContent);
        }
        return;
      }
    }

    container.innerHTML = `<div class="page"><h1>404</h1><p>页面未找到</p><button data-nav="/">返回首页</button></div>`;
    container.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.dataset.nav!));
    });
  }

  await renderRoute();
  onRouteChange(renderRoute);
}
