//! Local EPUB file reading with ZIP extraction and NCX/nav TOC parsing.
//!
//! EPUB is a ZIP-based ebook format. This module handles:
//! - ZIP extraction using the `zip` crate
//! - NCX table-of-contents parsing
//! - Nav document parsing (EPUB 3)
//! - XHTML content extraction

use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::path::Path;

use zip::ZipArchive;

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
    pub cover_data: Option<Vec<u8>>,
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
    /// Raw XHTML content.
    pub content: String,
}

/// Parse an EPUB file at the given path.
pub fn read_epub(path: &Path) -> std::io::Result<EpubBook> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    read_epub_from_reader(reader)
}

/// Parse an EPUB from any reader implementing `Read + Seek`.
pub fn read_epub_from_reader<R: Read + Seek>(reader: R) -> std::io::Result<EpubBook> {
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let mut title = String::new();
    let mut author = String::new();
    let mut chapters: Vec<EpubChapter> = Vec::new();
    let mut cover_data: Option<Vec<u8>> = None;

    // Get container.xml to find the OPF path
    let container_xml = get_file_str(&mut archive, "META-INF/container.xml")?;
    let opf_path = parse_container_xml(&container_xml);

    // Read the OPF file
    let opf_xml = get_file_str(&mut archive, &opf_path)?;
    let opf_dir = Path::new(&opf_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Parse OPF metadata
    let metadata = parse_opf_metadata(&opf_xml);
    title = metadata.title;
    author = metadata.author;

    // Parse spine and manifest
    let spine_items = parse_spine(&opf_xml);
    let manifest = parse_manifest(&opf_xml);

    // Try NCX TOC first, then nav
    let mut toc_found = false;
    if let Some(toc_href) = metadata.ncx {
        let toc_xml = get_file_str(&mut archive, &join_path(&opf_dir, &toc_href))?;
        chapters = parse_ncx_toc(&toc_xml);
        toc_found = true;
    }

    if !toc_found {
        if let Some(nav_href) = metadata.nav {
            let nav_xml = get_file_str(&mut archive, &join_path(&opf_dir, &nav_href))?;
            chapters = parse_nav_toc(&nav_xml);
        }
    }

    // Fallback: use spine order if no TOC found
    if chapters.is_empty() {
        chapters = spine_items
            .iter()
            .enumerate()
            .filter_map(|(i, item_ref)| {
                manifest.get(item_ref).map(|href| EpubChapter {
                    index: i,
                    title: None,
                    href: href.clone(),
                    content: String::new(),
                })
            })
            .collect();
    }

    // Load chapter content
    for chapter in &mut chapters {
        if let Ok(content) = get_file_str(&mut archive, &join_path(&opf_dir, &chapter.href)) {
            chapter.content = extract_text_from_xhtml(&content);
        }
    }

    // Try to find cover image
    if let Some(cover_href) = metadata.cover_image {
        if let Ok(data) = get_file_bytes(&mut archive, &join_path(&opf_dir, &cover_href)) {
            cover_data = Some(data);
        }
    }

    Ok(EpubBook {
        title,
        author,
        chapters,
        cover_data,
    })
}

fn get_file_str(archive: &mut ZipArchive<BufReader<File>>, name: &str) -> std::io::Result<String> {
    let mut file = archive.by_name(name)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e))?;
    let mut s = String::new();
    file.read_to_string(&mut s)?;
    Ok(s)
}

fn get_file_bytes(archive: &mut ZipArchive<BufReader<File>>, name: &str) -> std::io::Result<Vec<u8>> {
    let mut file = archive.by_name(name)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e))?;
    let mut v = Vec::new();
    file.read_to_end(&mut v)?;
    Ok(v)
}

fn parse_container_xml(xml: &str) -> String {
    // Find the rootfile path from container.xml
    if let Some(start) = xml.find("full-path=\"") {
        let after_equals = &xml[start + 11..];
        if let Some(end) = after_equals.find('"') {
            return after_equals[..end].to_string();
        }
    }
    "OEBPF/content.opf".to_string()
}

#[derive(Debug, Default)]
struct OpfMetadata {
    title: String,
    author: String,
    ncx: Option<String>,
    nav: Option<String>,
    cover_image: Option<String>,
}

fn parse_opf_metadata(opf_xml: &str) -> OpfMetadata {
    let mut metadata = OpfMetadata::default();

    // Extract title - look for dc:title or title tag
    if let Some(start) = opf_xml.find("<dc:title") {
        let after_open = &opf_xml[start + 9..];
        if let Some(end) = after_open.find("</dc:title>") {
            let content = &after_open[..end];
            if let Some(c_start) = content.find('>') {
                metadata.title = content[c_start + 1..].trim().to_string();
            }
        }
    }

    // Extract author/creator
    for tag in &["<dc:creator", "<creator"] {
        if let Some(start) = opf_xml.find(tag) {
            let after_open = &opf_xml[start + tag.len()..];
            let end_marker = if tag.contains("dc:creator") { "</dc:creator>" } else { "</creator>" };
            if let Some(end) = after_open.find(end_marker) {
                let content = &after_open[..end];
                if let Some(c_start) = content.find('>') {
                    metadata.author = content[c_start + 1..].trim().to_string();
                    break;
                }
            }
        }
    }

    // Extract NCX reference
    for tag in &["item href=\""] {
        if let Some(start) = opf_xml.find(tag) {
            let after_href = &opf_xml[start + 10..];
            if let Some(end) = after_href.find('"') {
                let href = &after_href[..end];
                if href.ends_with(".ncx") {
                    metadata.ncx = Some(href.to_string());
                }
            }
        }
    }

    // Extract nav reference (EPUB 3)
    if let Some(start) = opf_xml.find("properties=\"nav\"") {
        let before = &opf_xml[..start];
        if let Some(tag_start) = before.rfind("<item ") {
            let tag = &before[tag_start..];
            if tag.contains("href=\"") {
                let after_href = &tag[tag.find("href=\"").unwrap() + 6..];
                if let Some(end) = after_href.find('"') {
                    metadata.nav = Some(after_href[..end].to_string());
                }
            }
        }
    }

    // Extract cover image
    for tag in &["item href=\""] {
        if let Some(start) = opf_xml.find(tag) {
            let after_href = &opf_xml[start + 10..];
            if let Some(end) = after_href.find('"') {
                let href = &after_href[..end];
                if href.to_lowercase().contains("cover") {
                    metadata.cover_image = Some(href.to_string());
                }
            }
        }
    }

    metadata
}

fn parse_spine(opf_xml: &str) -> Vec<String> {
    let mut items = Vec::new();

    // Find <spine> tag
    let spine_start = match opf_xml.find("<spine") {
        Some(pos) => pos,
        None => return items,
    };

    let after_spine = &opf_xml[spine_start..];

    // Find all idref attributes in itemref tags
    let mut search_pos = 0;
    while let Some(itemref_pos) = after_spine[search_pos..].find("itemref") {
        let chunk = &after_spine[search_pos..];
        let chunk_after_itemref = &chunk[itemref_pos..];

        if let Some(idref_pos) = chunk_after_itemref.find("idref=\"") {
            let after_idref = &chunk_after_itemref[idref_pos + 7..];
            if let Some(end) = after_idref.find('"') {
                items.push(after_idref[..end].to_string());
            }
        }

        search_pos += itemref_pos + 7;
        if search_pos >= after_spine.len() {
            break;
        }
    }

    items
}

fn parse_manifest(opf_xml: &str) -> std::collections::HashMap<String, String> {
    let mut manifest = std::collections::HashMap::new();

    let mut search_pos = 0;
    while let Some(item_pos) = opf_xml[search_pos..].find("<item ") {
        let chunk = &opffml[search_pos..];
        let chunk_after_item = &chunk[item_pos..];

        if let (Some(id), Some(href)) = (extract_attr_val(chunk_after_item, "id"), extract_attr_val(chunk_after_item, "href")) {
            manifest.insert(id, href);
        }

        search_pos += item_pos + 5;
        if search_pos >= opf_xml.len() {
            break;
        }
    }

    manifest
}

fn extract_attr_val(tag: &str, attr_name: &str) -> Option<String> {
    let search = format!("{}=\"", attr_name);
    if let Some(start) = tag.find(&search) {
        let after_equals = &tag[start + search.len()..];
        if let Some(end) = after_equals.find('"') {
            return Some(after_equals[..end].to_string());
        }
    }
    None
}

fn parse_ncx_toc(ncx_xml: &str) -> Vec<EpubChapter> {
    let mut chapters = Vec::new();
    let mut index = 0;

    // Simple approach: find navPoint tags and extract text content and src
    let mut pos = 0;
    let bytes = ncx_xml.as_bytes();

    while pos < bytes.len() {
        // Look for <content src="
        if let Some(content_start) = bytes[pos..].windows(13).position(|w| w == b"content src=\"") {
            let after_content = pos + content_start + 13;
            if let Some(content_end) = bytes[after_content..].windows(1).position(|w| w[0] == b'"') {
                let src = String::from_utf8(bytes[after_content..after_content + content_end].to_vec()).unwrap_or_default();
                // Look backward for the navPoint text
                let text_start = match bytes[..after_content].windows(8).rposition(|w| w == b"<text>") {
                    Some(p) => p + 8,
                    None => 0,
                };
                let text_end = match bytes[text_start..after_content].windows(9).position(|w| w == b"</text>") {
                    Some(p) => text_start + p,
                    None => after_content,
                };
                let title = String::from_utf8(bytes[text_start..text_end].to_vec()).unwrap_or_default();

                if !src.is_empty() || !title.is_empty() {
                    chapters.push(EpubChapter {
                        index,
                        title: if title.is_empty() { None } else { Some(title) },
                        href: src,
                        content: String::new(),
                    });
                    index += 1;
                }
            }
        }
        pos += 1;
    }

    chapters
}

fn parse_nav_toc(nav_xml: &str) -> Vec<EpubChapter> {
    let mut chapters = Vec::new();
    let mut index = 0;

    // Find all <a> tags with href
    let mut pos = 0;
    let bytes = nav_xml.as_bytes();

    while pos < bytes.len() {
        // Look for <a href="
        if let Some(a_start) = bytes[pos..].windows(6).position(|w| w == b"<a href") {
            let after_a = pos + a_start;
            if bytes.get(after_a + 6) == Some(&b'"') || bytes.get(after_a + 6) == Some(&b' ') {
                // Find the href value
                if let Some(href_start) = bytes[after_a..].windows(6).position(|w| w == b"href=\"") {
                    let href_val_start = after_a + href_start + 6;
                    if let Some(href_end) = bytes[href_val_start..].windows(1).position(|w| w[0] == b'"') {
                        let href = String::from_utf8(bytes[href_val_start..href_val_start + href_end].to_vec()).unwrap_or_default();
                        // Find closing >
                        if let Some(tag_end) = bytes[after_a..].windows(1).position(|w| w[0] == b'>') {
                            let text_start = after_a + tag_end + 1;
                            // Find </a>
                            if let Some(end_a) = bytes[text_start..].windows(4).position(|w| w == b"</a>") {
                                let text = String::from_utf8(bytes[text_start..text_start + end_a].to_vec()).unwrap_or_default();

                                if !href.is_empty() {
                                    chapters.push(EpubChapter {
                                        index,
                                        title: Some(text.trim().to_string()),
                                        href: href.split('#').next().unwrap_or(&href).to_string(),
                                        content: String::new(),
                                    });
                                    index += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
        pos += 1;
    }

    chapters
}

fn join_path(dir: &str, file: &str) -> String {
    if dir.is_empty() {
        file.to_string()
    } else if dir.ends_with('/') {
        format!("{}{}", dir, file)
    } else {
        format!("{}/{}", dir, file)
    }
}

fn extract_text_from_xhtml(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;
    let bytes = html.as_bytes();
    let mut pos = 0;

    while pos < bytes.len() {
        if bytes[pos] == b'<' {
            in_tag = true;
            // Get tag name
            let tag_start = pos + 1;
            let mut tag_end = tag_start;
            while tag_end < bytes.len() && bytes[tag_end] != b'>' && !bytes[tag_end].is_ascii_whitespace() {
                tag_end += 1;
            }
            let tag_name_lower = String::from_utf8(bytes[tag_start..tag_end].to_vec())
                .unwrap_or_default()
                .to_lowercase();

            if tag_name_lower == "script" {
                in_script = true;
            } else if tag_name_lower == "style" {
                in_style = true;
            } else if tag_name_lower == "/p" || tag_name_lower == "br" || tag_name_lower == "/div" || tag_name_lower == "p" {
                result.push('\n');
            }

            // Find closing >
            while pos < bytes.len() && bytes[pos] != b'>' {
                pos += 1;
            }
        } else if bytes[pos] == b'>' && in_tag {
            in_tag = false;
        } else if bytes[pos] == b'&' && !in_tag {
            // Decode HTML entities
            pos += 1;
            let mut entity = Vec::new();
            while pos < bytes.len() && bytes[pos] != b';' && bytes[pos].is_ascii_alphanumeric() {
                entity.push(bytes[pos]);
                pos += 1;
            }
            let entity_str = String::from_utf8(entity).unwrap_or_default();
            let decoded = match entity_str.as_str() {
                "nbsp" => " ",
                "lt" => "<",
                "gt" => ">",
                "amp" => "&",
                "quot" => "\"",
                "apos" => "'",
                _ => {
                    result.push('&');
                    result.push_str(&entity_str);
                    continue;
                }
            };
            result.push_str(decoded);
        } else if !in_tag && !in_script && !in_style {
            result.push(bytes[pos] as char);
        }
        pos += 1;
    }

    // Clean up whitespace
    let mut cleaned = String::new();
    let mut last_was_newline = false;
    for c in result.chars() {
        if c == '\n' || c == '\r' {
            if !last_was_newline {
                cleaned.push('\n');
                last_was_newline = true;
            }
        } else if c.is_whitespace() {
            if !cleaned.is_empty() && !cleaned.ends_with(' ') && !cleaned.ends_with('\n') {
                cleaned.push(' ');
            }
            last_was_newline = false;
        } else {
            cleaned.push(c);
            last_was_newline = false;
        }
    }

    cleaned.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_container_xml_finds_opf_path() {
        let xml = r#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPF/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;
        let path = parse_container_xml(xml);
        assert_eq!(path, "OEBPF/content.opf");
    }

    #[test]
    fn parse_container_xml_handles_missing() {
        let xml = r#"<container><rootfiles></rootfiles></container>"#;
        let path = parse_container_xml(xml);
        // Falls back to default
        assert_eq!(path, "OEBPF/content.opf");
    }

    #[test]
    fn extract_attr_val_parses_correctly() {
        let tag = r#"item id="chapter1" href="chapter1.xhtml""#;
        assert_eq!(extract_attr_val(tag, "id"), Some("chapter1".to_string()));
        assert_eq!(extract_attr_val(tag, "href"), Some("chapter1.xhtml".to_string()));
    }

    #[test]
    fn extract_text_from_xhtml_strips_tags() {
        let html = "<p>Hello <strong>World</strong>!</p>";
        let text = extract_text_from_xhtml(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("World"));
    }

    #[test]
    fn extract_text_from_xhtml_handles_entities() {
        let html = "<p>Hello &nbsp; World &amp; Friends &lt;3</p>";
        let text = extract_text_from_xhtml(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("World"));
        assert!(text.contains("Friends"));
        assert!(text.contains("<3"));
    }

    #[test]
    fn join_path_combines_correctly() {
        assert_eq!(join_path("", "chapter.xhtml"), "chapter.xhtml");
        assert_eq!(join_path("OEBPF", "chapter.xhtml"), "OEBPF/chapter.xhtml");
        assert_eq!(join_path("OEBPF/", "chapter.xhtml"), "OEBPF/chapter.xhtml");
    }
}
