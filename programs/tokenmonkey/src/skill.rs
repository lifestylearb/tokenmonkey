use anchor_lang::solana_program::hash::hash;

/// Generate a deterministic skill challenge from randomness + challenge ID.
/// The winner must compute SHA-256(outcome || challenge_id_le_bytes) and submit it.
/// This proves they read the on-chain resolved state before claiming.
pub fn generate_skill_answer(outcome: &[u8; 32], challenge_id: u64) -> [u8; 32] {
    let mut preimage = Vec::with_capacity(40);
    preimage.extend_from_slice(outcome);
    preimage.extend_from_slice(&challenge_id.to_le_bytes());
    hash(&preimage).to_bytes()
}

/// Verify the skill challenge answer matches expected.
pub fn verify_skill_answer(expected: &[u8; 32], provided: &[u8; 32]) -> bool {
    expected == provided
}
