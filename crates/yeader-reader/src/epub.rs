//! Local EPUB file reading using epub-parser crate.

use std::path::Path;

use epub_parser::Epub;

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
    let book = Epub::parse(path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let title = book.metadata.title.unwrap_or_default();
    let author = book.metadata.author.unwrap_or_default();

    // Flatten TOC entries into chapters
    let chapters = flatten_toc(&book.toc, 0);

    // Try to get cover image (first image is typically the cover)
    let cover_data = book.images.first().map(|img| img.content.clone());

    Ok(EpubBook {
        title,
        author,
        chapters,
        cover_data,
    })
}

/// Flatten hierarchical TOC entries into a flat list of chapters.
fn flatten_toc(entries: &[epub_parser::TocEntry], start_index: usize) -> Vec<EpubChapter> {
    let mut chapters = Vec::new();
    let mut index = start_index;

    for entry in entries {
        let href = entry.href.split('#').next().unwrap_or(&entry.href).to_string();
        chapters.push(EpubChapter {
            index,
            title: Some(entry.label.clone()),
            href,
            content: String::new(),
        });
        index += 1;

        // Recursively flatten children
        if !entry.children.is_empty() {
            let child_chapters = flatten_toc(&entry.children, index);
            let child_count = child_chapters.len();
            chapters.extend(child_chapters);
            index += child_count;
        }
    }

    chapters
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatten_toc_handles_empty() {
        let entries: Vec<epub_parser::TocEntry> = vec![];
        let result = flatten_toc(&entries, 0);
        assert!(result.is_empty());
    }

    #[test]
    fn flatten_toc_handles_nested() {
        let child = epub_parser::TocEntry::new("Section 1.1".to_string(), "ch1.xhtml#s1".to_string());
        let mut parent = epub_parser::TocEntry::new("Chapter 1".to_string(), "ch1.xhtml".to_string());
        parent.children.push(child);

        let result = flatten_toc(&[parent], 0);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].title, Some("Chapter 1".to_string()));
        assert_eq!(result[0].href, "ch1.xhtml");
        assert_eq!(result[1].title, Some("Section 1.1".to_string()));
        assert_eq!(result[1].href, "ch1.xhtml");
    }
}
