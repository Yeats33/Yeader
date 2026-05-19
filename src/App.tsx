import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { importEpub } from "./api.ts";
import { NavBar } from "./components/NavBar.tsx";
import { LegacyPage, type LegacyPageDefinition } from "./legacy/LegacyPage.tsx";
import { useHashRoute } from "./routing/hashRoute.ts";
import { matchRoute } from "./routing/matchRoute.ts";
import { loadTheme, getCurrentTheme, getColorMode } from "./theme.ts";

import { renderBookshelfPage, initBookshelfHandlers } from "./pages/Bookshelf.ts";
import { renderSearchPage, initSearchHandlers } from "./pages/Search.ts";
import { renderReaderPage, initReader } from "./pages/Reader/index.ts";
import { renderIntegrationPage, initIntegrationPage } from "./pages/Integration.ts";
import { renderSoNovelWebuiPage, initSoNovelWebuiHandlers } from "./pages/SoNovelWebui.ts";
import { renderSoNovelConfigPage, initSoNovelConfigHandlers } from "./pages/SoNovelConfig.ts";
import { renderSoNovelRulesPage, initSoNovelRulesHandlers } from "./pages/SoNovelRules.ts";
import { renderSettingsPage, initSettingsHandlers } from "./pages/Settings.ts";
import { AccountPage } from "./pages/Account.tsx";
import { renderOnlineReaderPage, initOnlineReader } from "./pages/OnlineReader/index.ts";
import { renderOnlineChapterPage, initOnlineChapter } from "./pages/OnlineReader/chapter.ts";
import { renderSourceOpsPage, initSourceOpsHandlers } from "./pages/SourceOps.ts";

const HIDE_NAV_ROUTES = ["/integration/so-novel/webui"];

function resolvePage(routePath: string): LegacyPageDefinition | null {
  if (matchRoute("/", { path: routePath })) {
    return {
      render: renderBookshelfPage,
      init: initBookshelfHandlers,
    };
  }

  if (matchRoute("/search", { path: routePath })) {
    return {
      render: renderSearchPage,
      init: initSearchHandlers,
    };
  }

  const readerParams = matchRoute("/reader/:bookId", { path: routePath });
  if (readerParams) {
    const bookId = readerParams["bookId"] ?? "";
    return {
      render: () => renderReaderPage(bookId),
      init: initReader,
    };
  }

  if (matchRoute("/integration", { path: routePath })) {
    return {
      render: () => renderIntegrationPage(),
      init: initIntegrationPage,
    };
  }

  if (matchRoute("/integration/so-novel/webui", { path: routePath })) {
    return {
      render: () => renderSoNovelWebuiPage(),
      init: initSoNovelWebuiHandlers,
    };
  }

  if (matchRoute("/integration/so-novel/config", { path: routePath })) {
    return {
      render: () => renderSoNovelConfigPage(),
      init: initSoNovelConfigHandlers,
    };
  }

  if (matchRoute("/integration/so-novel/rules", { path: routePath })) {
    return {
      render: () => renderSoNovelRulesPage(),
      init: initSoNovelRulesHandlers,
    };
  }

  if (matchRoute("/account", { path: routePath })) {
    return null;
  }

  if (matchRoute("/settings", { path: routePath })) {
    return {
      render: renderSettingsPage,
      init: initSettingsHandlers,
    };
  }

  if (matchRoute("/source-ops", { path: routePath })) {
    return {
      render: renderSourceOpsPage,
      init: initSourceOpsHandlers,
    };
  }

  const onlineReaderParams = matchRoute("/online-reader/:bookId/:sourceId", { path: routePath });
  if (onlineReaderParams) {
    const bookId = onlineReaderParams["bookId"] ?? "";
    const sourceId = onlineReaderParams["sourceId"] ?? "";
    return {
      render: () => renderOnlineReaderPage(),
      init: (container) => initOnlineReader(container, decodeURIComponent(bookId), decodeURIComponent(sourceId)),
    };
  }

  const onlineChapterParams = matchRoute("/online-reader/:bookId/:sourceId/chapter/:chapterUrl", { path: routePath });
  if (onlineChapterParams) {
    const bookId = onlineChapterParams["bookId"] ?? "";
    const sourceId = onlineChapterParams["sourceId"] ?? "";
    const chapterUrl = onlineChapterParams["chapterUrl"] ?? "";
    return {
      render: () => renderOnlineChapterPage(),
      init: (container) => initOnlineChapter(
        container,
        decodeURIComponent(bookId),
        decodeURIComponent(sourceId),
        decodeURIComponent(chapterUrl),
      ),
    };
  }

  return null;
}

function NotFoundPage() {
  const { navigate } = useHashRoute();
  return (
    <div className="page">
      <h1>404</h1>
      <p>页面未找到</p>
      <button type="button" onClick={() => navigate("/")}>返回首页</button>
    </div>
  );
}

export function App() {
  const { route } = useHashRoute();
  const page = resolvePage(route.path);
  const hideNav = HIDE_NAV_ROUTES.some((path) => route.path.startsWith(path));

  useEffect(() => {
    loadTheme(getCurrentTheme(), getColorMode()).catch((error) => {
      console.warn("Theme load failed, using defaults:", error);
    });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>("so-novel-download-ready", async (event) => {
      const path = event.payload;
      console.log("so-novel downloaded:", path);
      try {
        const book = await importEpub(path);
        console.log("Imported to bookshelf:", book.name);
      } catch (error) {
        console.error("Failed to import so-novel download:", error);
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch((error) => {
      console.error("Failed to listen for so-novel downloads:", error);
    });

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <>
      {route.path === "/account" ? <AccountPage /> : page ? <LegacyPage page={page} routeKey={route.path} /> : <NotFoundPage />}
      {!hideNav ? <NavBar routePath={route.path} /> : null}
    </>
  );
}
