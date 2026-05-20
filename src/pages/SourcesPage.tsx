import { navigate } from "../router.ts";
import { PluginMarketPanel, SourceListTab } from "./SourcePanels.tsx";
import { useYeaderSources } from "./useYeaderSources.ts";

export function SourcesPage() {
  const { sources, loading } = useYeaderSources();

  return (
    <div className="page page-source-ops">
      <header className="page-header">
        <h1>来源</h1>
        <button className="btn-icon" type="button" onClick={() => navigate("/discover")} title="发现内容">
          发现
        </button>
      </header>

      <div className="source-ops-shell">
        <div className="source-ops-content">
          {loading ? <div className="loading">加载中...</div> : null}
          {!loading ? (
            <>
              <PluginMarketPanel />
              <SourceListTab sources={sources} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
