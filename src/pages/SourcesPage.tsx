import { navigate } from "../router.ts";
import { PluginMarketPanel, SourceInstallPanel, SourceListTab, BookSourceManagementPanel } from "./SourcePanels.tsx";
import { useYeaderSources } from "./useYeaderSources.ts";

export function SourcesPage() {
  const { sources, loading, refresh } = useYeaderSources();

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
              <SourceInstallPanel onImported={() => void refresh()} />
              <PluginMarketPanel />
              <SourceListTab sources={sources} />
              <BookSourceManagementPanel onRefresh={() => void refresh()} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
