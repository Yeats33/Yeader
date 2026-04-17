//! Protocol parsing for desktop import entrypoints.

use std::fmt::{Display, Formatter};

use yeader_models::{CompatImportArtifact, ImportArtifactKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseLegadoUriError {
    InvalidScheme,
    MissingImportPath,
    UnsupportedArtifactKind(String),
    MissingSrcParameter,
}

impl Display for ParseLegadoUriError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidScheme => f.write_str("invalid legado uri scheme"),
            Self::MissingImportPath => f.write_str("missing legado import target"),
            Self::UnsupportedArtifactKind(value) => {
                write!(f, "unsupported legado import target: {value}")
            }
            Self::MissingSrcParameter => f.write_str("missing legado src query parameter"),
        }
    }
}

impl std::error::Error for ParseLegadoUriError {}

pub fn parse_legado_import_uri(input: &str) -> Result<CompatImportArtifact, ParseLegadoUriError> {
    let scheme_prefix = "legado://";
    if !input.starts_with(scheme_prefix) {
        return Err(ParseLegadoUriError::InvalidScheme);
    }

    let (target, query) = parse_target_and_query(input)?;

    let kind = ImportArtifactKind::from_path_segment(target)
        .ok_or_else(|| ParseLegadoUriError::UnsupportedArtifactKind(target.to_string()))?;

    let src = find_query_value(query, "src").ok_or(ParseLegadoUriError::MissingSrcParameter)?;

    Ok(CompatImportArtifact {
        kind,
        src: percent_decode(src),
    })
}

fn parse_target_and_query(input: &str) -> Result<(&str, &str), ParseLegadoUriError> {
    const STANDARD_PREFIX: &str = "legado://import/";
    if let Some(remainder) = input.strip_prefix(STANDARD_PREFIX) {
        let (target, query) = remainder.split_once('?').unwrap_or((remainder, ""));
        if target.is_empty() {
            return Err(ParseLegadoUriError::MissingImportPath);
        }
        return Ok((target, query));
    }

    let remainder = input
        .strip_prefix("legado://")
        .ok_or(ParseLegadoUriError::InvalidScheme)?;
    let (host, tail) = remainder
        .split_once('/')
        .ok_or(ParseLegadoUriError::MissingImportPath)?;
    let (path, query) = tail.split_once('?').unwrap_or((tail, ""));

    if path == "importonline" && !host.is_empty() {
        return Ok((host, query));
    }

    Err(ParseLegadoUriError::MissingImportPath)
}

fn find_query_value<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    for pair in query.split('&') {
        let (candidate_key, candidate_value) = pair.split_once('=')?;
        if candidate_key == key {
            return Some(candidate_value);
        }
    }

    None
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = String::with_capacity(value.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                if let Some(byte) = decode_hex_byte(bytes[index + 1], bytes[index + 2]) {
                    decoded.push(byte as char);
                    index += 3;
                    continue;
                }

                decoded.push('%');
                index += 1;
            }
            b'+' => {
                decoded.push(' ');
                index += 1;
            }
            byte => {
                decoded.push(byte as char);
                index += 1;
            }
        }
    }

    decoded
}

fn decode_hex_byte(high: u8, low: u8) -> Option<u8> {
    let high = decode_hex_nibble(high)?;
    let low = decode_hex_nibble(low)?;
    Some((high << 4) | low)
}

fn decode_hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{ParseLegadoUriError, parse_legado_import_uri};
    use yeader_models::{CompatImportArtifact, ImportArtifactKind};

    #[test]
    fn parses_book_source_import_uri() {
        let parsed = parse_legado_import_uri(
            "legado://import/bookSource?src=https%3A%2F%2Fexample.com%2Fsource.json",
        )
        .expect("uri should parse");

        assert_eq!(
            parsed,
            CompatImportArtifact {
                kind: ImportArtifactKind::BookSource,
                src: "https://example.com/source.json".to_string(),
            }
        );
    }

    #[test]
    fn parses_http_tts_import_uri() {
        let parsed =
            parse_legado_import_uri("legado://import/httpTTS?src=https://example.com/tts.json")
                .expect("uri should parse");

        assert_eq!(parsed.kind, ImportArtifactKind::HttpTts);
        assert_eq!(parsed.src, "https://example.com/tts.json");
    }

    #[test]
    fn parses_importonline_booksource_alias() {
        let parsed = parse_legado_import_uri(
            "legado://booksource/importonline?src=https%3A%2F%2Fexample.com%2Fsource.json",
        )
        .expect("importonline alias should parse");

        assert_eq!(parsed.kind, ImportArtifactKind::BookSource);
        assert_eq!(parsed.src, "https://example.com/source.json");
    }

    #[test]
    fn parses_text_toc_rule_alias() {
        let parsed = parse_legado_import_uri(
            "legado://import/txtRule?src=https%3A%2F%2Fexample.com%2Ftoc.json",
        )
        .expect("txtRule alias should parse");

        assert_eq!(parsed.kind, ImportArtifactKind::TextTocRule);
        assert_eq!(parsed.src, "https://example.com/toc.json");
    }

    #[test]
    fn rejects_unknown_import_target() {
        let error = parse_legado_import_uri("legado://import/unknown?src=https://example.com")
            .expect_err("unknown target should fail");

        assert_eq!(
            error,
            ParseLegadoUriError::UnsupportedArtifactKind("unknown".to_string())
        );
    }

    #[test]
    fn rejects_missing_src_parameter() {
        let error = parse_legado_import_uri("legado://import/bookSource")
            .expect_err("missing src should fail");

        assert_eq!(error, ParseLegadoUriError::MissingSrcParameter);
    }
}
