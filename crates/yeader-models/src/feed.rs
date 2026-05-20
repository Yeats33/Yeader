//! Feed source and item types for Path 0: RSS/Atom native sources.

use serde::{Deserialize, Serialize};

/// A feed subscription source.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedSource {
    pub id: String,
    pub url: String,
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub icon_url: Option<String>,
    pub media_type: String,
    pub folder: Option<String>,
    pub enabled: bool,
}

/// A single item from an RSS/Atom feed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub url: String,
    pub author: Option<String>,
    pub published: Option<String>,
    pub updated: Option<String>,
    pub summary: Option<String>,
    pub content_html: Option<String>,
    pub image_url: Option<String>,
    pub read: bool,
}
