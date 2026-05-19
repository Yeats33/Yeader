//! Character encoding detection and decoding.

/// Extract charset from Content-Type header value.
pub fn extract_charset_from_content_type(content_type: &str) -> Option<String> {
    for part in content_type.split(';') {
        let part = part.trim();
        if part.starts_with("charset=") {
            return Some(part[8..].trim().to_string());
        }
    }
    None
}

/// Decode bytes to string using the specified charset or auto-detect.
pub fn decode_bytes(bytes: &[u8], charset: Option<&str>) -> Result<String, &'static str> {
    if let Some(cs) = charset {
        let encoding = encoding_rs::Encoding::for_label(cs.as_bytes()).ok_or("Unknown charset")?;
        let (decoded, _, _) = encoding.decode(bytes);
        Ok(decoded.to_string())
    } else {
        // Try UTF-8 first
        if let Ok(s) = std::str::from_utf8(bytes) {
            return Ok(s.to_string());
        }
        // Fallback to chardetng
        let mut detector = chardetng::EncodingDetector::new();
        detector.feed(bytes, true);
        let (encoding, _was_confident) = detector.guess_assess(None, false);
        let (decoded, _, _) = encoding.decode(bytes);
        Ok(decoded.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_charset_from_content_type() {
        assert_eq!(
            extract_charset_from_content_type("text/html; charset=UTF-8"),
            Some("UTF-8".to_string())
        );
        assert_eq!(
            extract_charset_from_content_type("application/json; charset=GBK"),
            Some("GBK".to_string())
        );
        assert_eq!(extract_charset_from_content_type("text/plain"), None);
        assert_eq!(
            extract_charset_from_content_type("text/html; charset=\"UTF-8\""),
            Some("\"UTF-8\"".to_string())
        );
    }

    #[test]
    fn test_decode_bytes_utf8() {
        let bytes = b"Hello, World!";
        let result = decode_bytes(bytes, Some("UTF-8")).unwrap();
        assert_eq!(result, "Hello, World!");
    }

    #[test]
    fn test_decode_bytes_default_utf8() {
        let bytes = b"Hello, World!";
        let result = decode_bytes(bytes, None).unwrap();
        assert_eq!(result, "Hello, World!");
    }

    #[test]
    fn test_decode_bytes_gbk() {
        // GBK encoded "你好" (hello in Chinese)
        let bytes = [0xC4, 0xE3, 0xBA, 0xC3];
        let result = decode_bytes(&bytes, Some("GBK")).unwrap();
        assert_eq!(result, "你好");
    }
}
