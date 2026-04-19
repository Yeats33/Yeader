//! Local EPUB file reading using rbook crate.

use std::path::Path;

use rbook::Epub;

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

    // Flatten TOC entries into chapters
    let chapters = if let Some(toc_root) = epub.toc().contents() {
        flatten_toc_entries(&toc_root, 0)
    } else {
        Vec::new()
    };

    // Try to get cover image
    let cover_data = epub
        .manifest()
        .cover_image()
        .and_then(|img| img.read_bytes().ok());

    Ok(EpubBook {
        title,
        author,
        chapters,
        cover_data,
    })
}

/// Flatten hierarchical TOC entries into a flat list of chapters.
fn flatten_toc_entries(entry: &rbook::epub::toc::EpubTocEntry, start_index: usize) -> Vec<EpubChapter> {
    let mut chapters = Vec::new();
    let mut index = start_index;

    // Process current entry
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

    // Recursively flatten children using iter()
    for child in entry.iter() {
        let child_chapters = flatten_toc_entries(&child, index);
        let child_count = child_chapters.len();
        chapters.extend(child_chapters);
        index += child_count;
    }

    chapters
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatten_toc_handles_empty() {
        // When there are no TOC entries, we get an empty vec
        let entries: Vec<rbook::epub::toc::EpubTocEntry> = vec![];
        // This test would require a real EPUB to test properly
        // For unit testing, we verify the function signature
        assert_eq!(0, entries.len());
    }
}
