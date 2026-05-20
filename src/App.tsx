import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { importEpub } from "./api.ts";
import { NavBar } from "./components/NavBar.tsx";
import { useHashRoute } from "./routing/hashRoute.ts";
import { matchRoute } from "./routing/matchRoute.ts";
import { loadTheme, getCurrentTheme, getColorModePreference, watchSystemColorMode } from "./theme.ts";

import { BookshelfPage } from "./pages/BookshelfPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { DiscoverPage } from "./pages/DiscoverPage.tsx";
import { SourcesPage } from "./pages/SourcesPage.tsx";
import { ReaderPage } from "./pages/Reader/index.tsx";
import { IntegrationPage } from "./pages/Integration.tsx";
import { SoNovelWebuiPage } from "./pages/SoNovelWebui.tsx";
import { SoNovelConfigPage } from "./pages/SoNovelConfig.tsx";
import { SoNovelRulesPage } from "./pages/SoNovelRules.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { AccountPage } from "./pages/Account.tsx";
import { OnlineReaderPage } from "./pages/OnlineReader/index.tsx";
import { OnlineChapterPage } from "./pages/OnlineReader/chapter.tsx";
import { SourceOpsPage } from "./pages/SourceOps.tsx";

const HIDE_NAV_ROUTES = ["/integration/so-novel/webui"];

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

function CurrentRoutePage({ routePath }: { routePath: string }) {
  if (routePath === "/" || routePath === "/library") return <BookshelfPage />;
  if (routePath === "/discover") return <DiscoverPage />;
  if (routePath === "/sources") return <SourcesPage />;
  if (routePath === "/search") return <SearchPage />;
  if (routePath === "/account") return <AccountPage />;
  if (routePath === "/settings") return <SettingsPage />;
  if (routePath === "/integration") return <IntegrationPage />;
  if (routePath === "/integration/so-novel/webui") return <SoNovelWebuiPage />;
  if (routePath === "/integration/so-novel/config") return <SoNovelConfigPage />;
  if (routePath === "/integration/so-novel/rules") return <SoNovelRulesPage />;
  if (routePath === "/source-ops") return <SourceOpsPage />;

  const onlineReaderParams = matchRoute("/online-reader/:bookId/:sourceId", { path: routePath });
  if (onlineReaderParams) {
    return (
      <OnlineReaderPage
        bookUrl={decodeURIComponent(onlineReaderParams["bookId"] ?? "")}
        sourceUrl={decodeURIComponent(onlineReaderParams["sourceId"] ?? "")}
      />
    );
  }

  const onlineChapterParams = matchRoute("/online-reader/:bookId/:sourceId/chapter/:chapterUrl", { path: routePath });
  if (onlineChapterParams) {
    return (
      <OnlineChapterPage
        bookUrl={decodeURIComponent(onlineChapterParams["bookId"] ?? "")}
        sourceUrl={decodeURIComponent(onlineChapterParams["sourceId"] ?? "")}
        chapterUrl={decodeURIComponent(onlineChapterParams["chapterUrl"] ?? "")}
      />
    );
  }

  const readerParams = matchRoute("/reader/:bookId", { path: routePath });
  if (readerParams) {
    return <ReaderPage bookUrl={readerParams["bookId"] ?? ""} />;
  }

  return <NotFoundPage />;
}

export function App() {
  const { route } = useHashRoute();
  const hideNav = HIDE_NAV_ROUTES.some((path) => route.path.startsWith(path));

  useEffect(() => {
    const stopWatchingSystemTheme = watchSystemColorMode();
    loadTheme(getCurrentTheme(), getColorModePreference()).catch(() => {});
    return stopWatchingSystemTheme;
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>("so-novel-download-ready", async (event) => {
      const path = event.payload;
      try {
        await importEpub(path);
      } catch {
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch(() => {});

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <>
      <CurrentRoutePage routePath={route.path} />
      {!hideNav ? <NavBar routePath={route.path} /> : null}
    </>
  );
}
