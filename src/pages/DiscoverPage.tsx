import { useState } from "react";
import { navigate } from "../router.ts";
import { ExploreTab } from "./ExplorePage.tsx";
import { ImportTab } from "./SourcePanels.tsx";
import { SourceSearchTab } from "./SourceSearch.tsx";
import { useYeaderSources } from "./useYeaderSources.ts";

type DiscoverTab = "explore" | "search" | "link";

export function DiscoverPage({ initialSourceId = "" }: { initialSourceId?: string }) {
  const [tab, setTab] = useState<DiscoverTab>("explore");
  const { sources, loading } = useYeaderSources();

  return (
    <div className="page page-source-ops">
      <header className="page-header">
        <h1>发现</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/sources")} title="管理来源">
          来源
        </button>
      </header>

      <div className="source-ops-shell">
        <div className="source-ops-tabs">
          <button className={`tab-btn ${tab === "explore" ? "active" : ""}`} type="button" onClick={() => setTab("explore")}>浏览</button>
          <button className={`tab-btn ${tab === "search" ? "active" : ""}`} type="button" onClick={() => setTab("search")}>搜索</button>
          <button className={`tab-btn ${tab === "link" ? "active" : ""}`} type="button" onClick={() => setTab("link")}>链接</button>
        </div>

        <div className="source-ops-content">
          {loading ? <div className="loading">加载中...</div> : null}
          {!loading && tab === "explore" ? <ExploreTab sources={sources} initialSourceId={initialSourceId} /> : null}
          {!loading && tab === "search" ? <SourceSearchTab sources={sources} /> : null}
          {!loading && tab === "link" ? <ImportTab sources={sources} /> : null}
        </div>
      </div>
    </div>
  );
}
