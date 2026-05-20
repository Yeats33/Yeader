use async_trait::async_trait;

use crate::error::{PluginError, PluginResult};
use crate::host::HostApi;
use crate::model::{
    AssetUrl, ChapterInfo, ContentDetail, PluginMetaInfo, ProcessedAsset, SearchQuery,
    SearchResult, Session,
};

/// Source plugin trait. One implementation per site.
///
/// Default implementations return `PluginError::NotSupported` for optional
/// capabilities so a site without login/post-processing only has to override
/// the methods it actually supports.
#[async_trait]
pub trait SourcePlugin: Send + Sync {
    fn meta(&self) -> PluginMetaInfo;

    fn id(&self) -> &str;

    async fn search(
        &self,
        host: &dyn HostApi,
        query: SearchQuery,
    ) -> PluginResult<SearchResult>;

    async fn content(&self, host: &dyn HostApi, content_id: &str)
        -> PluginResult<ContentDetail>;

    async fn toc(
        &self,
        host: &dyn HostApi,
        content_id: &str,
    ) -> PluginResult<Vec<ChapterInfo>>;

    async fn assets(
        &self,
        host: &dyn HostApi,
        chapter_id: &str,
    ) -> PluginResult<Vec<AssetUrl>>;

    async fn login(
        &self,
        _host: &dyn HostApi,
        _username: &str,
        _password: &str,
    ) -> PluginResult<Session> {
        Err(PluginError::NotSupported)
    }

    /// Transform raw asset bytes the host fetched.
    ///
    /// Called once per asset, regardless of whether the host is streaming a
    /// page to the reader (default) or batch-fetching for offline pin. The
    /// plugin is unaware of which mode it is in. Default returns bytes
    /// unchanged; sources that need decryption, descrambling, or transcoding
    /// override this.
    ///
    /// See `PHILOSOPHY.md` §2.6 and `docs/PLUGIN_SYSTEM.md` §4.5.
    async fn transform_asset(
        &self,
        _host: &dyn HostApi,
        _asset: &AssetUrl,
        bytes: Vec<u8>,
    ) -> PluginResult<ProcessedAsset> {
        Ok(ProcessedAsset::passthrough(bytes))
    }
}
