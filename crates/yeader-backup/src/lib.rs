//! Backup import services for Legado compatibility.
//!
//! Supports both directory-based backups and `backup*.zip` archives
//! produced by upstream legado.

use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::Path;

use yeader_models::{
    LegacyBookSource, LegacyReplaceRule, LegacyRssSource, parse_book_sources, parse_replace_rules,
    parse_rss_sources,
};

#[derive(Debug, Clone, PartialEq)]
pub struct BackupBundle {
    pub book_sources: Vec<LegacyBookSource>,
    pub rss_sources: Vec<LegacyRssSource>,
    pub replace_rules: Vec<LegacyReplaceRule>,
    pub raw_files: BTreeMap<String, String>,
}

/// Load a backup from an auto-detected path (zip file or directory).
pub fn load_backup(path: impl AsRef<Path>) -> Result<BackupBundle, BackupLoadError> {
    let path = path.as_ref();
    if path.is_dir() {
        load_backup_dir(path)
    } else if path.is_file() {
        load_backup_zip(path)
    } else {
        Err(BackupLoadError::NotFound)
    }
}

/// Load a backup from an extracted directory.
pub fn load_backup_dir(path: impl AsRef<Path>) -> Result<BackupBundle, BackupLoadError> {
    let path = path.as_ref();
    if !path.is_dir() {
        return Err(BackupLoadError::NotDirectory);
    }

    let mut files = BTreeMap::new();

    for entry in fs::read_dir(path).map_err(BackupLoadError::Io)? {
        let entry = entry.map_err(BackupLoadError::Io)?;
        let file_type = entry.file_type().map_err(BackupLoadError::Io)?;
        if !file_type.is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        let content = fs::read_to_string(entry.path())
            .map_err(BackupLoadError::Io)?
            .trim_end_matches(['\r', '\n'])
            .to_string();

        files.insert(file_name, content);
    }

    bundle_from_files(files)
}

/// Load a backup from a zip archive (upstream `backup*.zip` format).
pub fn load_backup_zip(path: impl AsRef<Path>) -> Result<BackupBundle, BackupLoadError> {
    let path = path.as_ref();
    let file = fs::File::open(path).map_err(BackupLoadError::Io)?;
    load_backup_zip_reader(file)
}

/// Load a backup from any `Read + Seek` source containing a zip archive.
pub fn load_backup_zip_reader<R: Read + std::io::Seek>(
    reader: R,
) -> Result<BackupBundle, BackupLoadError> {
    let mut archive = zip::ZipArchive::new(reader).map_err(BackupLoadError::Zip)?;
    let mut files = BTreeMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(BackupLoadError::Zip)?;

        if entry.is_dir() {
            continue;
        }

        // Strip any directory prefix — legado zips may nest files under a folder.
        let raw_name = entry.name().to_string();
        let file_name = raw_name.rsplit('/').next().unwrap_or(&raw_name).to_string();

        if file_name.is_empty() {
            continue;
        }

        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|e| BackupLoadError::Io(e))?;
        let content = content.trim_end_matches(['\r', '\n']).to_string();

        files.insert(file_name, content);
    }

    bundle_from_files(files)
}

/// Build a `BackupBundle` from a filename→content map.
fn bundle_from_files(files: BTreeMap<String, String>) -> Result<BackupBundle, BackupLoadError> {
    let mut bundle = BackupBundle {
        book_sources: Vec::new(),
        rss_sources: Vec::new(),
        replace_rules: Vec::new(),
        raw_files: files,
    };

    if let Some(content) = bundle.raw_files.get("bookSource.json") {
        bundle.book_sources =
            parse_book_sources(content).map_err(|source| BackupLoadError::Parse {
                file: "bookSource.json".to_string(),
                source,
            })?;
    }

    if let Some(content) = bundle.raw_files.get("rssSources.json") {
        bundle.rss_sources =
            parse_rss_sources(content).map_err(|source| BackupLoadError::Parse {
                file: "rssSources.json".to_string(),
                source,
            })?;
    }

    if let Some(content) = bundle.raw_files.get("replaceRule.json") {
        bundle.replace_rules =
            parse_replace_rules(content).map_err(|source| BackupLoadError::Parse {
                file: "replaceRule.json".to_string(),
                source,
            })?;
    }

    Ok(bundle)
}

#[derive(Debug)]
pub enum BackupLoadError {
    NotFound,
    NotDirectory,
    Io(std::io::Error),
    Zip(zip::result::ZipError),
    Parse {
        file: String,
        source: serde_json::Error,
    },
}

impl std::fmt::Display for BackupLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => f.write_str("backup path does not exist"),
            Self::NotDirectory => f.write_str("backup path is not a directory"),
            Self::Io(source) => write!(f, "failed to read backup: {source}"),
            Self::Zip(source) => write!(f, "failed to read zip archive: {source}"),
            Self::Parse { file, source } => {
                write!(f, "failed to parse backup file {file}: {source}")
            }
        }
    }
}

impl std::error::Error for BackupLoadError {}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};
    use std::path::PathBuf;

    use zip::write::SimpleFileOptions;

    use super::*;

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/legado/backups/sample-backup")
    }

    fn fixture_zip() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/legado/backups/sample-backup.zip")
    }

    // --- directory tests (preserved from original) ---

    #[test]
    fn loads_backup_directory_and_parses_known_entities() {
        let bundle = load_backup_dir(fixture_dir()).expect("fixture backup should parse");

        assert_eq!(bundle.book_sources.len(), 1);
        assert_eq!(bundle.rss_sources.len(), 1);
        assert_eq!(bundle.replace_rules.len(), 1);
        assert_eq!(bundle.book_sources[0].book_source_name, "Fixture Source");
        assert_eq!(bundle.rss_sources[0].source_name, "Fixture RSS");
        assert_eq!(bundle.replace_rules[0].name, "Trim Sponsor");

        assert_eq!(
            bundle.raw_files.get("readConfig.json").map(String::as_str),
            Some("[{\"name\":\"default\",\"fontSize\":20}]")
        );
        assert_eq!(
            bundle.raw_files.get("config.xml").map(String::as_str),
            Some("<map><boolean name=\"useReplaceRule\" value=\"true\" /></map>")
        );
    }

    #[test]
    fn preserves_unknown_files_for_future_compatibility_work() {
        let bundle = load_backup_dir(fixture_dir()).expect("fixture backup should parse");

        assert_eq!(
            bundle.raw_files.get("custom-note.txt").map(String::as_str),
            Some("keep me for later")
        );
    }

    #[test]
    fn rejects_non_directory_paths() {
        let error = load_backup_dir(fixture_dir().join("bookSource.json"))
            .expect_err("file path should be rejected");

        assert!(matches!(error, BackupLoadError::NotDirectory));
    }

    // --- zip tests ---

    #[test]
    fn loads_backup_zip_fixture() {
        let bundle = load_backup_zip(fixture_zip()).expect("zip fixture should parse");

        assert_eq!(bundle.book_sources.len(), 1);
        assert_eq!(bundle.rss_sources.len(), 1);
        assert_eq!(bundle.replace_rules.len(), 1);
        assert_eq!(bundle.book_sources[0].book_source_name, "Fixture Source");
        assert_eq!(bundle.rss_sources[0].source_name, "Fixture RSS");
        assert_eq!(bundle.replace_rules[0].name, "Trim Sponsor");
    }

    #[test]
    fn zip_preserves_raw_files() {
        let bundle = load_backup_zip(fixture_zip()).expect("zip fixture should parse");

        assert_eq!(
            bundle.raw_files.get("readConfig.json").map(String::as_str),
            Some("[{\"name\":\"default\",\"fontSize\":20}]")
        );
        assert_eq!(
            bundle.raw_files.get("custom-note.txt").map(String::as_str),
            Some("keep me for later")
        );
    }

    #[test]
    fn zip_and_dir_produce_same_bundle() {
        let from_dir = load_backup_dir(fixture_dir()).expect("dir fixture");
        let from_zip = load_backup_zip(fixture_zip()).expect("zip fixture");

        assert_eq!(from_dir, from_zip);
    }

    #[test]
    fn zip_handles_nested_directory_prefix() {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buf);
            let opts = SimpleFileOptions::default();
            writer
                .start_file("backup-2024/bookSource.json", opts)
                .unwrap();
            writer
                .write_all(b"[{\"bookSourceUrl\":\"https://x.com\",\"bookSourceName\":\"Nested\",\"enabled\":true}]")
                .unwrap();
            writer.finish().unwrap();
        }

        buf.set_position(0);
        let bundle = load_backup_zip_reader(buf).expect("nested zip should parse");
        assert_eq!(bundle.book_sources.len(), 1);
        assert_eq!(bundle.book_sources[0].book_source_name, "Nested");
    }

    #[test]
    fn load_backup_auto_detects_dir() {
        let bundle = load_backup(fixture_dir()).expect("auto-detect dir");
        assert_eq!(bundle.book_sources.len(), 1);
    }

    #[test]
    fn load_backup_auto_detects_zip() {
        let bundle = load_backup(fixture_zip()).expect("auto-detect zip");
        assert_eq!(bundle.book_sources.len(), 1);
    }
}
