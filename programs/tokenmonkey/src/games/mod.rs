pub mod coinflip;
pub mod dice;

use anchor_lang::prelude::*;
use crate::state::GameType;

/// Given 32 bytes of randomness and game params, determine if the creator wins.
/// Returns true if creator wins, false if acceptor wins.
pub fn resolve_game(
    game_type: GameType,
    randomness: &[u8; 32],
    game_params: &[u8; 32],
) -> Result<bool> {
    match game_type {
        GameType::Coinflip => coinflip::resolve(randomness, game_params),
        GameType::Dice => dice::resolve(randomness, game_params),
    }
}
