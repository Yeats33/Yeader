import { navigate, onRouteChange, getRoute, matchRoute } from "./router.ts";
import { renderBookshelfPage, initBookshelfHandlers } from "./pages/Bookshelf.ts";
import { renderSearchPage, initSearchHandlers } from "./pages/Search.ts";
import { renderReaderPage, initReaderHandlers } from "./pages/Reader.ts";
import { renderSettingsPage, initSettingsHandlers } from "./pages/Settings.ts";

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
    init: initReaderHandlers,
  },
  {
    pattern: "/settings",
    render: renderSettingsPage,
    init: initSettingsHandlers,
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
