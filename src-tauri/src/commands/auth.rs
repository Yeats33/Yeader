use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use yeader_library::{AuthRepo, AuthSession};

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub verified: bool,
    pub wallet_address: String,
    pub chain_id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthSessionInfo {
    pub wallet_address: String,
    pub chain_id: i64,
    pub created_at: String,
    pub expires_at: String,
}

// =====================================================================
// Tauri commands
// =====================================================================

#[tauri::command]
pub async fn generate_auth_nonce(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = AuthRepo::new(&db);

    let nonce = uuid::Uuid::new_v4().to_string();

    // Nonce valid for 5 minutes
    repo.save_nonce(&nonce, "5 minutes")
        .map_err(|e| format!("Failed to save nonce: {e}"))?;

    Ok(nonce)
}

#[tauri::command]
pub async fn verify_evm_auth(
    state: tauri::State<'_, AppState>,
    message: String,
    signature: String,
    address: String,
    chain_id: i64,
) -> Result<AuthResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = AuthRepo::new(&db);

    // 1. Verify the ECDSA signature
    let recovered_address = recover_evm_address(&message, &signature)
        .map_err(|e| format!("Signature verification failed: {e}"))?;

    if recovered_address.to_lowercase() != address.to_lowercase() {
        return Ok(AuthResult {
            verified: false,
            wallet_address: address,
            chain_id: 0,
        });
    }

    // 2. Consume the nonce from the message to prevent replay
    if let Some(nonce) = extract_nonce(&message) {
        repo.consume_nonce(&nonce)
            .map_err(|e| format!("Nonce check failed: {e}"))?;
    }

    // 3. Create a session (7 days expiry)
    let now = chrono::Utc::now();
    let expires_at = (now + chrono::Duration::days(7))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let created_at = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();

    repo.save_session(&AuthSession {
        wallet_address: address.clone(),
        chain_id,
        created_at: created_at.clone(),
        expires_at: expires_at.clone(),
    })
    .map_err(|e| format!("Failed to save session: {e}"))?;

    Ok(AuthResult {
        verified: true,
        wallet_address: address,
        chain_id,
    })
}

#[tauri::command]
pub async fn get_auth_session(
    state: tauri::State<'_, AppState>,
) -> Result<Option<AuthSessionInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = AuthRepo::new(&db);

    let session = repo
        .find_valid_session()
        .map_err(|e| format!("Failed to query session: {e}"))?;

    Ok(session.map(|s| AuthSessionInfo {
        wallet_address: s.wallet_address,
        chain_id: s.chain_id,
        created_at: s.created_at,
        expires_at: s.expires_at,
    }))
}

#[tauri::command]
pub async fn clear_auth_session(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = AuthRepo::new(&db);

    repo.clear_session()
        .map_err(|e| format!("Failed to clear session: {e}"))?;

    Ok(())
}

// =====================================================================
// Signature verification helpers
// =====================================================================

fn recover_evm_address(message: &str, signature_hex: &str) -> Result<String, String> {
    // Strip "0x" prefix
    let sig_hex = signature_hex.strip_prefix("0x").unwrap_or(signature_hex);
    let sig_bytes =
        hex::decode(sig_hex).map_err(|e| format!("Invalid signature hex: {e}"))?;

    if sig_bytes.len() != 65 {
        return Err(format!(
            "Signature must be 65 bytes, got {}",
            sig_bytes.len()
        ));
    }

    let v = sig_bytes[64];
    let recovery_id = RecoveryId::try_from(v - 27)
        .map_err(|e| format!("Invalid recovery id {v}: {e:?}"))?;

    let sig = Signature::from_slice(&sig_bytes[..64])
        .map_err(|e| format!("Invalid signature: {e}"))?;

    // Build EIP-191 message hash
    let msg_hash = eip191_hash(message);

    // Recover public key
    let recovered_key = VerifyingKey::recover_from_prehash(&msg_hash, &sig, recovery_id)
        .map_err(|e| format!("Failed to recover key: {e}"))?;

    // Derive Ethereum address from public key
    let address = pubkey_to_eth_address(&recovered_key);

    Ok(address)
}

fn eip191_hash(message: &str) -> k256::elliptic_curve::FieldBytes<k256::Secp256k1> {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    hasher.finalize()
}

fn pubkey_to_eth_address(vk: &VerifyingKey) -> String {
    // Get the uncompressed public key (65 bytes: 04 + x + y)
    let encoded = vk.to_encoded_point(false);
    let pubkey_bytes = encoded.as_bytes();

    // Skip the 0x04 prefix byte, hash the rest with keccak256
    let mut hasher = Keccak256::new();
    hasher.update(&pubkey_bytes[1..]);
    let hash = hasher.finalize();

    // Ethereum address is the last 20 bytes of the hash
    format!("0x{}", hex::encode(&hash[12..]))
}

fn extract_nonce(message: &str) -> Option<String> {
    message
        .lines()
        .find(|line| line.starts_with("Nonce:"))
        .map(|line| line.trim_start_matches("Nonce:").trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eip191_hash_smoke() {
        let hash = eip191_hash("hello");
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_extract_nonce() {
        let msg = "yeader.cc wants you to sign in with your Ethereum account.\n\nNonce: abc-123";
        assert_eq!(extract_nonce(msg), Some("abc-123".to_string()));
    }
}
