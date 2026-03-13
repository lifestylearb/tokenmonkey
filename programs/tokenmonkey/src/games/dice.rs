use anchor_lang::prelude::*;
use crate::errors::TokenMonkeyError;

/// Dice game logic.
///
/// game_params[0..2]: Target number as u16 LE (2-12).
/// game_params[2]: Direction — 0 = over, 1 = under.
/// Two dice rolled from randomness[0] and randomness[1], each % 6 + 1.
/// Creator wins if their prediction (over/under the target) is correct.
/// Exact match on target = acceptor wins (slight house edge for acceptor side).
pub fn resolve(randomness: &[u8; 32], game_params: &[u8; 32]) -> Result<bool> {
    let target = u16::from_le_bytes([game_params[0], game_params[1]]);
    let direction = game_params[2];

    require!(target >= 2 && target <= 12, TokenMonkeyError::InvalidGameParams);
    require!(direction <= 1, TokenMonkeyError::InvalidGameParams);

    let die1 = (randomness[0] % 6) as u16 + 1;
    let die2 = (randomness[1] % 6) as u16 + 1;
    let sum = die1 + die2;

    let creator_wins = if direction == 0 {
        sum > target // over
    } else {
        sum < target // under
    };

    Ok(creator_wins)
}
