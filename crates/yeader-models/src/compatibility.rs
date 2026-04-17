use serde::{Deserialize, Serialize};

/// Supported import/export artifact kinds aligned with Legado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportArtifactKind {
    BookSource,
    RssSource,
    ReplaceRule,
    ReadConfig,
    Theme,
    AddToBookshelf,
    TextTocRule,
    HttpTts,
    DictRule,
}

impl ImportArtifactKind {
    pub fn as_path_segment(self) -> &'static str {
        match self {
            Self::BookSource => "bookSource",
            Self::RssSource => "rssSource",
            Self::ReplaceRule => "replaceRule",
            Self::ReadConfig => "readConfig",
            Self::Theme => "theme",
            Self::AddToBookshelf => "addToBookshelf",
            Self::TextTocRule => "textTocRule",
            Self::HttpTts => "httpTTS",
            Self::DictRule => "dictRule",
        }
    }

    pub fn from_path_segment(value: &str) -> Option<Self> {
        match value {
            "bookSource" | "booksource" => Some(Self::BookSource),
            "rssSource" | "rsssource" => Some(Self::RssSource),
            "replaceRule" => Some(Self::ReplaceRule),
            "readConfig" => Some(Self::ReadConfig),
            "theme" => Some(Self::Theme),
            "addToBookshelf" => Some(Self::AddToBookshelf),
            "textTocRule" | "txtRule" => Some(Self::TextTocRule),
            "httpTTS" | "httpTts" => Some(Self::HttpTts),
            "dictRule" => Some(Self::DictRule),
            _ => None,
        }
    }
}

/// Normalized import payload shared across protocol, backup, and UI layers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompatImportArtifact {
    pub kind: ImportArtifactKind,
    pub src: String,
}

#[cfg(test)]
mod tests {
    use super::{CompatImportArtifact, ImportArtifactKind};

    #[test]
    fn artifact_kind_round_trips_with_known_path_segments() {
        let kinds = [
            ImportArtifactKind::BookSource,
            ImportArtifactKind::RssSource,
            ImportArtifactKind::ReplaceRule,
            ImportArtifactKind::ReadConfig,
            ImportArtifactKind::Theme,
            ImportArtifactKind::AddToBookshelf,
            ImportArtifactKind::TextTocRule,
            ImportArtifactKind::HttpTts,
            ImportArtifactKind::DictRule,
        ];

        for kind in kinds {
            assert_eq!(
                ImportArtifactKind::from_path_segment(kind.as_path_segment()),
                Some(kind)
            );
        }
    }

    #[test]
    fn compat_import_artifact_serializes_in_camel_case() {
        let artifact = CompatImportArtifact {
            kind: ImportArtifactKind::BookSource,
            src: "https://example.com/source.json".to_string(),
        };

        let json = serde_json::to_string(&artifact).expect("artifact should serialize");

        assert_eq!(
            json,
            r#"{"kind":"bookSource","src":"https://example.com/source.json"}"#
        );
    }
}
