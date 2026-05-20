//! Plugin runtime: shared `HostApi` impl (reqwest-backed) + `PluginRegistry`.
//!
//! Source plugins are registered here and exposed to the Tauri layer via a
//! single `PluginRegistry::dispatch_*` surface. Hand-off contract follows
//! `docs/PLUGIN_SYSTEM.md` §4.5: streaming is the default; offline pinning is
//! a future-opt-in path the host orchestrates around this registry.

pub mod host;
pub mod registry;

pub use host::HttpHostApi;
pub use registry::PluginRegistry;
