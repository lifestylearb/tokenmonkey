use anchor_lang::prelude::*;

#[error_code]
pub enum TokenMonkeyError {
    #[msg("Casino is paused")]
    CasinoPaused,
    #[msg("Unauthorized: not admin")]
    Unauthorized,
    #[msg("Bet amount below minimum")]
    BetTooLow,
    #[msg("Bet amount above maximum")]
    BetTooHigh,
    #[msg("Invalid AI proof: hash does not meet difficulty requirement")]
    InvalidAiProof,
    #[msg("Player already registered")]
    AlreadyRegistered,
    #[msg("Challenge is not in Open status")]
    ChallengeNotOpen,
    #[msg("Challenge is not in Matched status")]
    ChallengeNotMatched,
    #[msg("Challenge is not in Resolved status")]
    ChallengeNotResolved,
    #[msg("Cannot accept own challenge")]
    CannotAcceptOwnChallenge,
    #[msg("Challenge has expired")]
    ChallengeExpired,
    #[msg("Challenge has not expired yet")]
    ChallengeNotExpired,
    #[msg("Randomness not yet revealed")]
    RandomnessNotRevealed,
    #[msg("Invalid skill challenge answer")]
    InvalidSkillAnswer,
    #[msg("Not the winner of this challenge")]
    NotWinner,
    #[msg("Invalid game parameters")]
    InvalidGameParams,
    #[msg("Rake basis points exceed maximum")]
    RakeTooHigh,
    #[msg("Numerical overflow")]
    Overflow,
    #[msg("Player not registered")]
    PlayerNotRegistered,
    #[msg("Invalid USDC mint")]
    InvalidUsdcMint,
}
