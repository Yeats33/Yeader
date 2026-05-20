//! 功能型插件:加密、哈希、编码工具。
//!
//! 设计为无状态函数库,源型插件直接 `use yeader_crypto::*`。
//! 不持有任何状态,不直接发起网络请求。

use aes::Aes256;
use aes::cipher::generic_array::GenericArray;
use aes::cipher::{BlockDecrypt, KeyInit};
use base64::Engine;
use md5::{Digest, Md5};

use yeader_sdk::PluginError;

/// MD5 hex (lowercase, 32 chars).
pub fn md5_hex(input: impl AsRef<[u8]>) -> String {
    let digest = Md5::digest(input.as_ref());
    hex::encode(digest)
}

/// Base64 decode (standard alphabet).
pub fn base64_decode(input: &str) -> Result<Vec<u8>, PluginError> {
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|err| PluginError::Decryption(format!("base64 decode failed: {err}")))
}

/// Base64 encode (standard alphabet).
pub fn base64_encode(input: impl AsRef<[u8]>) -> String {
    base64::engine::general_purpose::STANDARD.encode(input.as_ref())
}

/// AES-256-ECB decrypt with PKCS#7 padding stripping.
///
/// `key` must be exactly 32 bytes. JM's API encrypts response payloads with
/// `md5_hex(ts || secret)` as the key — the hex string itself is treated as
/// 32 ASCII bytes. Despite "CBC" wording in some references the upstream
/// Kotlin implementation actually decrypts block-by-block with no IV chaining,
/// matching this routine.
pub fn aes256_ecb_decrypt(key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, PluginError> {
    if key.len() != 32 {
        return Err(PluginError::Decryption(format!(
            "aes-256 key must be 32 bytes, got {}",
            key.len()
        )));
    }
    if ciphertext.is_empty() || ciphertext.len() % 16 != 0 {
        return Err(PluginError::Decryption(format!(
            "aes-256 ciphertext must be a non-empty multiple of 16 bytes, got {}",
            ciphertext.len()
        )));
    }

    let cipher = Aes256::new(GenericArray::from_slice(key));
    let mut out = Vec::with_capacity(ciphertext.len());
    for chunk in ciphertext.chunks(16) {
        let mut block = GenericArray::clone_from_slice(chunk);
        cipher.decrypt_block(&mut block);
        out.extend_from_slice(&block);
    }

    let pad = *out
        .last()
        .ok_or_else(|| PluginError::Decryption("empty plaintext".to_string()))?
        as usize;
    if pad == 0 || pad > 16 || pad > out.len() {
        return Err(PluginError::Decryption(format!("invalid pkcs7 pad: {pad}")));
    }
    out.truncate(out.len() - pad);
    Ok(out)
}

/// Decrypt a base64-wrapped AES-256 payload using `md5_hex(salt)` as the key.
///
/// Convenience for JM-style APIs: `decrypt_md5_keyed("{ts}{secret}", payload)`.
pub fn decrypt_md5_keyed(salt: &str, base64_payload: &str) -> Result<String, PluginError> {
    let key_hex = md5_hex(salt);
    let cipher = base64_decode(base64_payload)?;
    let plain = aes256_ecb_decrypt(key_hex.as_bytes(), &cipher)?;
    String::from_utf8(plain).map_err(|err| PluginError::Parse(err.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes::cipher::BlockEncrypt;

    #[test]
    fn md5_hex_matches_known_vector() {
        assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
    }

    #[test]
    fn aes_ecb_roundtrip_with_pkcs7() {
        let key = b"0123456789abcdef0123456789abcdef";
        let plaintext = b"yeader plugin crypto roundtrip test";

        let pad_len = 16 - (plaintext.len() % 16);
        let mut padded = plaintext.to_vec();
        padded.extend(std::iter::repeat(pad_len as u8).take(pad_len));

        let cipher = Aes256::new(GenericArray::from_slice(key));
        let mut ct = Vec::with_capacity(padded.len());
        for chunk in padded.chunks(16) {
            let mut block = GenericArray::clone_from_slice(chunk);
            cipher.encrypt_block(&mut block);
            ct.extend_from_slice(&block);
        }

        let out = aes256_ecb_decrypt(key, &ct).expect("decrypt");
        assert_eq!(out, plaintext);
    }

    #[test]
    fn aes_decrypt_rejects_bad_key_len() {
        let err = aes256_ecb_decrypt(b"short", &[0u8; 16]).unwrap_err();
        matches!(err, PluginError::Decryption(_));
    }

    #[test]
    fn aes_decrypt_rejects_unaligned_input() {
        let err = aes256_ecb_decrypt(&[0u8; 32], &[0u8; 15]).unwrap_err();
        matches!(err, PluginError::Decryption(_));
    }

    #[test]
    fn base64_roundtrip() {
        let raw = b"hello yeader";
        let encoded = base64_encode(raw);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded, raw);
    }
}
