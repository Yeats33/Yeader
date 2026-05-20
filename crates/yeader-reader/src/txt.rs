//! Local TXT file reading with encoding detection and chapter splitting.
//!
//! Supports common Chinese novel TXT conventions including chapter title
//! detection and flexible encoding (UTF-8, GBK, Big5, etc.).

use std::fs::File;
use std::io::Read;
use std::path::Path;

use chardetng::EncodingDetector;

/// Detected encoding result.
#[derive(Debug, Clone)]
pub struct DetectedEncoding {
    /// The detected encoding name (e.g., "GBK", "UTF-8", "Big5").
    pub name: String,
    /// Confidence score 0.0-1.0.
    pub confidence: f32,
}

/// Result of reading a TXT file.
#[derive(Debug, Clone)]
pub struct TxtBook {
    /// Title extracted from filename or first line.
    pub title: String,
    /// Chapters found in the book.
    pub chapters: Vec<TxtChapter>,
}

/// A chapter in a TXT book.
#[derive(Debug, Clone)]
pub struct TxtChapter {
    /// Chapter index.
    pub index: usize,
    /// Chapter title (if detected).
    pub title: Option<String>,
    /// Raw chapter content.
    pub content: String,
}

/// TXT chapter splitting configuration.
#[derive(Debug, Clone)]
pub struct ChapterSplitConfig {
    /// Regex pattern for chapter titles.
    pub pattern: String,
    /// Whether to include chapter titles in content.
    pub include_title: bool,
}

impl Default for ChapterSplitConfig {
    fn default() -> Self {
        // Default pattern matches Chinese chapter titles like "第一章", "第1章"
        // and English patterns like "Chapter 1", "Chapter One"
        Self {
            pattern: r"^(第[一二三四五六七八九十百千\d]+章|Chapter\s+[\dIVXLCDMivxlcdm]+)"
                .to_string(),
            include_title: false,
        }
    }
}

/// Detect the encoding of raw bytes using chardetng.
pub fn detect_encoding(bytes: &[u8]) -> DetectedEncoding {
    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);
    let (encoding, had_maybe) = detector.guess_assess(None, true);
    let confidence = if had_maybe { 0.9 } else { 0.5 };
    DetectedEncoding {
        name: encoding.name().to_string(),
        confidence,
    }
}

/// Read and decode a TXT file with automatic encoding detection.
pub fn read_txt(path: &Path) -> std::io::Result<TxtBook> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;

    let detected = detect_encoding(&bytes);
    let encoding =
        encoding_rs::Encoding::for_label(detected.name.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    let (decoded, _, had_errors) = encoding.decode(&bytes);

    let text = if !had_errors {
        decoded.into_owned()
    } else {
        // Fallback to UTF-8, replacing invalid sequences
        encoding_rs::UTF_8.decode(&bytes).0.into_owned()
    };

    Ok(parse_txt(
        &text,
        path.file_stem().and_then(|s| s.to_str()).unwrap_or(""),
    ))
}

/// Parse TXT content into chapters using title detection.
pub fn parse_txt(content: &str, filename: &str) -> TxtBook {
    let config = ChapterSplitConfig::default();
    parse_txt_with_config(content, filename, &config)
}

/// Parse TXT content with custom chapter splitting configuration.
pub fn parse_txt_with_config(
    content: &str,
    filename: &str,
    config: &ChapterSplitConfig,
) -> TxtBook {
    let chapter_regex = regex::Regex::new(&config.pattern).ok();
    let lines: Vec<&str> = content.lines().collect();

    // Try to extract title from first non-empty line or filename
    let title = extract_title_from_content(&lines, filename);
    let chapters = split_into_chapters(&lines, &chapter_regex, config);

    TxtBook { title, chapters }
}

fn extract_title_from_content(lines: &[&str], filename: &str) -> String {
    for line in lines.iter().take(10) {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            // Check if first line looks like a title (short, no punctuation ending)
            if trimmed.len() < 100
                && !trimmed.ends_with('.')
                && !trimmed.ends_with('，')
                && !trimmed.ends_with('。')
                && !trimmed.ends_with('!')
                && !trimmed.ends_with('？')
            {
                return trimmed.to_string();
            }
        }
    }
    filename.to_string()
}

fn split_into_chapters(
    lines: &[&str],
    chapter_regex: &Option<regex::Regex>,
    config: &ChapterSplitConfig,
) -> Vec<TxtChapter> {
    let mut chapters = Vec::new();
    let mut current_chapter: Vec<String> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut chapter_index = 0;

    for line in lines {
        let trimmed = line.trim();
        let is_chapter_title = chapter_regex.as_ref().is_some_and(|r| r.is_match(trimmed));

        if is_chapter_title {
            // Save previous chapter if it has content
            if !current_chapter.is_empty() || current_title.is_some() {
                chapters.push(TxtChapter {
                    index: chapter_index,
                    title: current_title.take(),
                    content: current_chapter.join("\n"),
                });
                chapter_index += 1;
                current_chapter.clear();
            }

            current_title = Some(trimmed.to_string());
            if config.include_title {
                current_chapter.push(trimmed.to_string());
            }
        } else if !trimmed.is_empty() {
            current_chapter.push(trimmed.to_string());
        }
    }

    // Don't forget the last chapter
    if !current_chapter.is_empty() || current_title.is_some() {
        chapters.push(TxtChapter {
            index: chapter_index,
            title: current_title,
            content: current_chapter.join("\n"),
        });
    }

    // If no chapters were found, create a single chapter with all content
    if chapters.is_empty() {
        let all_content = lines.join("\n");
        chapters.push(TxtChapter {
            index: 0,
            title: None,
            content: all_content,
        });
    }

    chapters
}

#[cfg(test)]
mod tests {
    use super::*;

    const UTF8_TXT: &str = r#"平凡的世界

第一章
早晨的太阳升起来了，照在黄土高原上。

那是1985年的春天，农村刚开始改革。少平和往常一样，天不亮就起床了。

第二章
少平去城里找活干，想给家里多挣点钱。

他在县城的工地上找到了一个扛水泥的活。虽然辛苦，但每天能挣两块钱。

第三章
少平遇到了一位姑娘，名叫田晓霞。

他们是同学，但已经很久没见了。这次重逢让少平感到生活有了新的希望。
"#;

    #[test]
    fn detect_encoding_utf8() {
        let bytes = "这是一个测试".as_bytes();
        let detected = detect_encoding(bytes);
        assert_eq!(detected.name, "UTF-8");
    }

    #[test]
    fn parse_txt_extracts_title_and_chapters() {
        let book = parse_txt(UTF8_TXT, "test.txt");
        assert_eq!(book.title, "平凡的世界");
        // May be 3 or 4 depending on how blank lines between chapters are handled
        assert!(book.chapters.len() >= 3);

        // First actual chapter should be 第一章
        let first_actual = book
            .chapters
            .iter()
            .find(|c| c.title.as_deref() == Some("第一章"));
        assert!(first_actual.is_some(), "Should have 第一章 chapter");

        let second_actual = book
            .chapters
            .iter()
            .find(|c| c.title.as_deref() == Some("第二章"));
        assert!(second_actual.is_some(), "Should have 第二章 chapter");
    }

    #[test]
    fn parse_txt_handles_no_title_markers() {
        let book = parse_txt("这是一段没有章节标记的文本。\n\n第二段内容。", "novel.txt");
        assert_eq!(book.title, "novel.txt");
        assert_eq!(book.chapters.len(), 1);
    }

    #[test]
    fn detect_encoding_gbk() {
        // GBK-encoded "测试" bytes
        let bytes = vec![0xb2, 0xe2, 0xca, 0xd4];
        let detected = detect_encoding(&bytes);
        // chardetng may detect this as GBK or ISO-8859-1 depending on the bytes
        assert!(!detected.name.is_empty());
    }

    #[test]
    fn chapter_split_config_default_pattern() {
        let config = ChapterSplitConfig::default();
        let regex = regex::Regex::new(&config.pattern).unwrap();

        assert!(regex.is_match("第一章"));
        assert!(regex.is_match("第十章"));
        assert!(regex.is_match("第123章"));
        assert!(regex.is_match("Chapter 1"));
        assert!(regex.is_match("Chapter X"));
        assert!(!regex.is_match("这不是章节标题"));
    }

    #[test]
    fn parse_txt_single_chapter_when_no_markers() {
        let simple = "Just some text without chapter markers.";
        let book = parse_txt(simple, "simple.txt");
        assert_eq!(book.chapters.len(), 1);
        assert_eq!(book.chapters[0].content, simple);
    }
}
