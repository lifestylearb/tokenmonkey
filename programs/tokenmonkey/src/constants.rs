pub const CASINO_CONFIG_SEED: &[u8] = b"casino_config";
pub const PLAYER_SEED: &[u8] = b"player";
pub const CHALLENGE_SEED: &[u8] = b"challenge";
pub const VAULT_SEED: &[u8] = b"vault";

pub const DEFAULT_RAKE_BPS: u16 = 250; // 2.5%
pub const MAX_RAKE_BPS: u16 = 1000; // 10% cap
pub const MIN_BET_USDC: u64 = 1_000_000; // 1 USDC (6 decimals)
pub const MAX_BET_USDC: u64 = 10_000_000_000; // 10,000 USDC
pub const CHALLENGE_EXPIRY_SECONDS: i64 = 86_400; // 24 hours
pub const USDC_DECIMALS: u8 = 6;

/// Number of leading zero bits required in AI proof hash
pub const AI_PROOF_DIFFICULTY: u8 = 20; // ~1M hashes to solve

/// Switchboard On-Demand program IDs (different per network)
#[cfg(feature = "devnet")]
pub const SWITCHBOARD_ON_DEMAND_ID: &str = "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2";

#[cfg(not(feature = "devnet"))]
pub const SWITCHBOARD_ON_DEMAND_ID: &str = "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv";
