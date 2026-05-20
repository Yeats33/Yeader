use std::collections::HashMap;
use std::sync::Arc;

use yeader_sdk::{
    AssetUrl, ChapterInfo, ContentDetail, HostApi, PluginError, PluginMetaInfo, PluginResult,
    ProcessedAsset, SearchQuery, SearchResult, Session, SourcePlugin,
};

/// Registry of source plugins backed by a shared `HostApi`.
///
/// Built-in plugins are registered at construction time via the
/// `with_builtins` helper exposed by the consuming crate (e.g., `src-tauri`
/// composes the host + registers `yeader-plugin-jm`). The registry owns
/// the host so callers don't need to thread it through every call.
pub struct PluginRegistry {
    plugins: HashMap<String, Arc<dyn SourcePlugin>>,
    host: Arc<dyn HostApi>,
}

impl PluginRegistry {
    pub fn new(host: Arc<dyn HostApi>) -> Self {
        Self {
            plugins: HashMap::new(),
            host,
        }
    }

    pub fn register(&mut self, plugin: Arc<dyn SourcePlugin>) {
        let id = plugin.id().to_string();
        self.plugins.insert(id, plugin);
    }

    pub fn list_meta(&self) -> Vec<PluginMetaInfo> {
        let mut metas: Vec<_> = self.plugins.values().map(|p| p.meta()).collect();
        metas.sort_by(|a, b| a.id.cmp(&b.id));
        metas
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn SourcePlugin>> {
        self.plugins.get(id).cloned()
    }

    fn resolve(&self, id: &str) -> PluginResult<Arc<dyn SourcePlugin>> {
        self.plugins
            .get(id)
            .cloned()
            .ok_or_else(|| PluginError::InvalidArgument(format!("unknown plugin: {id}")))
    }

    pub async fn search(
        &self,
        plugin_id: &str,
        query: SearchQuery,
    ) -> PluginResult<SearchResult> {
        let plugin = self.resolve(plugin_id)?;
        plugin.search(self.host.as_ref(), query).await
    }

    pub async fn content(
        &self,
        plugin_id: &str,
        content_id: &str,
    ) -> PluginResult<ContentDetail> {
        let plugin = self.resolve(plugin_id)?;
        plugin.content(self.host.as_ref(), content_id).await
    }

    pub async fn toc(
        &self,
        plugin_id: &str,
        content_id: &str,
    ) -> PluginResult<Vec<ChapterInfo>> {
        let plugin = self.resolve(plugin_id)?;
        plugin.toc(self.host.as_ref(), content_id).await
    }

    pub async fn assets(
        &self,
        plugin_id: &str,
        chapter_id: &str,
    ) -> PluginResult<Vec<AssetUrl>> {
        let plugin = self.resolve(plugin_id)?;
        plugin.assets(self.host.as_ref(), chapter_id).await
    }

    pub async fn login(
        &self,
        plugin_id: &str,
        username: &str,
        password: &str,
    ) -> PluginResult<Session> {
        let plugin = self.resolve(plugin_id)?;
        plugin.login(self.host.as_ref(), username, password).await
    }

    /// Convenience: fetch + transform an asset in one call (default path
    /// for the reader's per-page streaming pipeline; see PLUGIN_SYSTEM §4.5).
    pub async fn fetch_and_transform(
        &self,
        plugin_id: &str,
        asset: &AssetUrl,
    ) -> PluginResult<ProcessedAsset> {
        let plugin = self.resolve(plugin_id)?;
        let bytes = self
            .host
            .http_request(
                yeader_sdk::HttpRequest::get(&asset.url).header(
                    "user-agent",
                    "Mozilla/5.0 (Yeader)",
                ),
            )
            .await?
            .body;
        plugin.transform_asset(self.host.as_ref(), asset, bytes).await
    }
}

impl std::fmt::Debug for PluginRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginRegistry")
            .field("plugins", &self.plugins.keys().collect::<Vec<_>>())
            .finish()
    }
}
