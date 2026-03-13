use anchor_lang::prelude::*;

#[event]
pub struct AgentRegistered {
    pub wallet: Pubkey,
    pub referral_code: [u8; 8],
    pub timestamp: i64,
}

#[event]
pub struct ChallengeCreated {
    pub challenge_id: u64,
    pub creator: Pubkey,
    pub amount_usdc: u64,
    pub game_type: u8,
    pub expires_at: i64,
}

#[event]
pub struct ChallengeAccepted {
    pub challenge_id: u64,
    pub acceptor: Pubkey,
    pub amount_usdc: u64,
}

#[event]
pub struct GameResolved {
    pub challenge_id: u64,
    pub winner: Pubkey,
    pub loser: Pubkey,
    pub game_type: u8,
    pub outcome: [u8; 32],
}

#[event]
pub struct WinningsClaimed {
    pub challenge_id: u64,
    pub winner: Pubkey,
    pub payout_usdc: u64,
    pub rake_usdc: u64,
}

#[event]
pub struct ChallengeCancelled {
    pub challenge_id: u64,
    pub creator: Pubkey,
    pub refund_usdc: u64,
}

#[event]
pub struct ChallengeExpired {
    pub challenge_id: u64,
    pub creator: Pubkey,
    pub refund_usdc: u64,
}
