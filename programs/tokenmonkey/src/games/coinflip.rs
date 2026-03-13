use anchor_lang::prelude::*;
use crate::errors::TokenMonkeyError;

/// Coinflip game logic.
///
/// game_params[0]: Creator's pick — 0 = heads, 1 = tails.
/// randomness[0] % 2: The flip result.
/// Creator wins if their pick matches the result.
pub fn resolve(randomness: &[u8; 32], game_params: &[u8; 32]) -> Result<bool> {
    let creator_pick = game_params[0];
    require!(creator_pick <= 1, TokenMonkeyError::InvalidGameParams);

    let result = randomness[0] % 2;
    Ok(creator_pick == result)
}
