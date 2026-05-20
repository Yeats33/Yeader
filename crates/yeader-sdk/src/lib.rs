//! Yeader 插件运行时核心:定义源型插件 trait、HostApi、通用 DTO。
//!
//! 设计要点见 `docs/PLUGIN_SYSTEM.md`。

pub mod error;
pub mod host;
pub mod model;
pub mod plugin;

pub use error::{PluginError, PluginResult};
pub use host::{HostApi, HttpMethod, HttpRequest, HttpResponse, LogLevel};
pub use model::{
    AssetUrl, Capabilities, ChapterInfo, ContentDetail, PluginKind, PluginMetaInfo,
    PluginRuntimeKind, ProcessedAsset, SearchHit, SearchQuery, SearchResult, SearchSort, Session,
};
pub use plugin::SourcePlugin;
