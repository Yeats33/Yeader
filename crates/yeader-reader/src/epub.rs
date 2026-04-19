//! Local EPUB file reading using rbook crate.

use base64::Engine;
use std::collections::HashMap;
use std::path::Path;

use rbook::Epub;

/// Cover image data with MIME type.
#[derive(Debug, Clone)]
pub struct CoverData {
    /// Raw image bytes.
    pub data: Vec<u8>,
    /// MIME type (e.g., "image/jpeg", "image/png").
    pub media_type: String,
}

/// Result of reading an EPUB file.
#[derive(Debug, Clone)]
pub struct EpubBook {
    /// Title extracted from metadata.
    pub title: String,
    /// Author(s) from metadata.
    pub author: String,
    /// Chapters found in the book.
    pub chapters: Vec<EpubChapter>,
    /// Cover image data if found.
    pub cover_data: Option<CoverData>,
}

/// A chapter in an EPUB book.
#[derive(Debug, Clone)]
pub struct EpubChapter {
    /// Chapter index.
    pub index: usize,
    /// Chapter title.
    pub title: Option<String>,
    /// HREF to the content file.
    pub href: String,
    /// Raw XHTML content with inlined images.
    pub content: String,
}

/// Build a map of all manifest resource hrefs to inlineable data URIs.
fn decode_path(path: &str) -> String {
    // Try percent-decoding, fall back to original
    percent_encoding::percent_decode_str(path)
        .decode_utf8_lossy()
        .into_owned()
}

fn build_inline_map(epub: &Epub) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for entry in epub.manifest().iter() {
        let href = decode_path(entry.href().as_str());
        if let Ok(bytes) = entry.read_bytes() {
            let mime = entry.media_type();
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            map.insert(href, format!("data:{};base64,{}", mime, b64));
        }
    }
    map
}

/// Resolve a possibly-relative href against a base path.
fn resolve_href(base_href: &str, src: &str) -> String {
    let base = base_href
        .rsplit_once('/')
        .map(|(dir, _)| dir)
        .unwrap_or("");

    let combined = if src.starts_with('/')
        || src.starts_with("http://")
        || src.starts_with("https://")
    {
        src.to_string()
    } else if base.is_empty() {
        src.to_string()
    } else {
        format!("{}/{}", base, src)
    };

    let segments: Vec<&str> = combined.split('/').collect();
    let mut resolved: Vec<&str> = Vec::new();
    for seg in segments {
        match seg {
            "" | "." => {}
            ".." => {
                resolved.pop();
            }
            _ => resolved.push(seg),
        }
    }
    resolved.join("/")
}

/// Inline image references in XHTML content using a manifest resource map.
fn inline_images(content: &str, href: &str, inline_map: &HashMap<String, String>) -> String {
    let mut result = content.to_string();

    // Match <img src="..." /> or <img src='...' ... />
    let img_pattern = regex::Regex::new(r#"<img\s[^>]*src=["']([^"']+)["']"#).unwrap();
    result = img_pattern
        .replace_all(&result, |caps: &regex::Captures| {
            let raw_src = &caps[1];
            let resolved = decode_path(&resolve_href(href, raw_src));
            if let Some(data_uri) = inline_map.get(&resolved) {
                caps[0].replace(raw_src, data_uri.as_str())
            } else {
                caps[0].to_string()
            }
        })
        .to_string();

    result
}

/// Parse an EPUB file at the given path.
pub fn read_epub(path: &Path) -> std::io::Result<EpubBook> {
    let epub = Epub::open(path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let title = epub
        .metadata()
        .title()
        .map(|t| t.value().to_string())
        .unwrap_or_default();

    let author = epub
        .metadata()
        .creators()
        .next()
        .map(|c| c.value().to_string())
        .unwrap_or_default();

    // Build inline map for all manifest resources
    let inline_map = build_inline_map(&epub);

    // Flatten TOC entries into chapters
    let toc_chapters: Vec<_> = if let Some(toc_root) = epub.toc().contents() {
        flatten_toc_entries(&toc_root, 0)
    } else {
        Vec::new()
    };

    let chapters: Vec<EpubChapter> = if toc_chapters.is_empty() {
        // No TOC: build chapters from spine
        let mut epub_reader = epub.reader();
        epub_reader.reset();
        let mut chs = Vec::new();
        let mut idx = 0;
        while let Some(result) = epub_reader.read_next() {
            match result {
                Ok(content) => {
                    let href = content.manifest_entry().href().to_string();
                    let raw = content.into_string();
                    let content = inline_images(&raw, &href, &inline_map);
                    chs.push(EpubChapter {
                        index: idx,
                        title: Some(format!("Chapter {}", idx + 1)),
                        href: href.clone(),
                        content,
                    });
                    idx += 1;
                }
                Err(_) => break,
            }
        }
        chs
    } else {
        // Build href -> content map from spine
        let mut href_content_map: HashMap<String, String> = HashMap::new();
        let mut epub_reader = epub.reader();
        epub_reader.reset();
        while let Some(result) = epub_reader.read_next() {
            if let Ok(content) = result {
                let href = content.manifest_entry().href().to_string();
                href_content_map.insert(href, content.into_string());
            }
        }

        // Match TOC entries to content
        toc_chapters
            .into_iter()
            .map(|mut ch| {
                let raw = href_content_map.remove(&ch.href).unwrap_or_default();
                ch.content = inline_images(&raw, &ch.href, &inline_map);
                ch
            })
            .collect()
    };

    // Try to get cover image
    let cover_data = epub
        .manifest()
        .cover_image()
        .and_then(|img| {
            let data = img.read_bytes().ok()?;
            let media_type = img.media_type().to_string();
            Some(CoverData { data, media_type })
        });

    Ok(EpubBook {
        title,
        author,
        chapters,
        cover_data,
    })
}

/// Flatten hierarchical TOC entries into a flat list of chapters.
fn flatten_toc_entries(
    entry: &rbook::epub::toc::EpubTocEntry,
    start_index: usize,
) -> Vec<EpubChapter> {
    let mut chapters = Vec::new();
    let mut index = start_index;

    let href = entry
        .href()
        .map(|h| h.as_str().to_string())
        .unwrap_or_default();
    let title = Some(entry.label().to_string());

    chapters.push(EpubChapter {
        index,
        title,
        href,
        content: String::new(),
    });
    index += 1;

    for child in entry.iter() {
        let child_chapters = flatten_toc_entries(&child, index);
        let child_count = child_chapters.len();
        chapters.extend(child_chapters);
        index += child_count;
    }

    chapters
}
