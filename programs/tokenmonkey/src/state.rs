use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CasinoConfig {
    pub admin: Pubkey,
    pub revenue_wallet: Pubkey,
    pub usdc_mint: Pubkey,
    pub rake_bps: u16,
    pub min_bet_usdc: u64,
    pub max_bet_usdc: u64,
    pub paused: bool,
    pub total_challenges: u64,
    pub total_volume_usdc: u64,
    pub total_rake_collected: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerAccount {
    pub wallet: Pubkey,
    pub total_wagered: u64,
    pub bets_placed: u32,
    pub wins: u32,
    pub losses: u32,
    pub games_played: u32,
    pub referral_code: [u8; 8],
    pub referred_by: Pubkey,
    pub referral_count: u16,
    pub registered_at: i64,
    pub last_played_at: i64,
    pub ai_proof_hash: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum GameType {
    Coinflip,
    Dice,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ChallengeStatus {
    Open,
    Matched,
    Resolved,
    Claimed,
    Cancelled,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub id: u64,
    pub creator: Pubkey,
    pub acceptor: Pubkey,
    pub amount_usdc: u64,
    pub game_type: GameType,
    pub game_params: [u8; 32],
    pub status: ChallengeStatus,
    pub vault_bump: u8,
    pub randomness_seed: [u8; 32],
    pub outcome: [u8; 32],
    pub winner: Pubkey,
    pub skill_answer: [u8; 32],
    pub created_at: i64,
    pub expires_at: i64,
    pub resolved_at: i64,
    pub claimed_at: i64,
    pub bump: u8,
}
