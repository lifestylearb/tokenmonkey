use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::GameResolved;
use crate::games;
use crate::skill;
use crate::state::{Challenge, ChallengeStatus, PlayerAccount};

#[cfg(not(feature = "test-mode"))]
use switchboard_on_demand::accounts::RandomnessAccountData;

#[derive(Accounts)]
pub struct ResolveGame<'info> {
    /// Anyone can crank resolution (permissionless).
    pub resolver: Signer<'info>,

    #[account(
        mut,
        seeds = [CHALLENGE_SEED, challenge.id.to_le_bytes().as_ref()],
        bump = challenge.bump,
        constraint = challenge.status == ChallengeStatus::Matched @ TokenMonkeyError::ChallengeNotMatched,
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, challenge.creator.as_ref()],
        bump = creator_player.bump,
    )]
    pub creator_player: Account<'info, PlayerAccount>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, challenge.acceptor.as_ref()],
        bump = acceptor_player.bump,
    )]
    pub acceptor_player: Account<'info, PlayerAccount>,

    // In production, the Switchboard randomness account must be passed
    // as remaining_accounts[0]. In test-mode, no extra accounts needed.
}

pub fn handler(ctx: Context<ResolveGame>) -> Result<()> {
    let clock = Clock::get()?;
    let challenge = &ctx.accounts.challenge;

    // === Production: Switchboard VRF randomness ===
    #[cfg(not(feature = "test-mode"))]
    let outcome: [u8; 32] = {
        require!(
            !ctx.remaining_accounts.is_empty(),
            TokenMonkeyError::RandomnessNotRevealed
        );

        let randomness_info = &ctx.remaining_accounts[0];

        // Verify the randomness account matches what was committed at challenge creation
        require!(
            randomness_info.key().to_bytes() == challenge.randomness_seed,
            TokenMonkeyError::RandomnessNotRevealed
        );

        // Parse and read the revealed randomness value
        let randomness_data = RandomnessAccountData::parse(
            randomness_info.data.borrow()
        ).map_err(|_| error!(TokenMonkeyError::RandomnessNotRevealed))?;

        randomness_data
            .get_value(clock.slot)
            .map_err(|_| error!(TokenMonkeyError::RandomnessNotRevealed))?
    };

    // === Test mode: deterministic randomness from seed ===
    #[cfg(feature = "test-mode")]
    let outcome: [u8; 32] = {
        let mut randomness_preimage = Vec::with_capacity(72);
        randomness_preimage.extend_from_slice(&challenge.randomness_seed);
        randomness_preimage.extend_from_slice(&challenge.id.to_le_bytes());
        randomness_preimage.extend_from_slice(&challenge.created_at.to_le_bytes());
        hash(&randomness_preimage).to_bytes()
    };

    // Determine winner using game logic
    let creator_wins = games::resolve_game(
        challenge.game_type,
        &outcome,
        &challenge.game_params,
    )?;

    let (winner, loser) = if creator_wins {
        (challenge.creator, challenge.acceptor)
    } else {
        (challenge.acceptor, challenge.creator)
    };

    // Generate skill challenge answer
    let skill_answer = skill::generate_skill_answer(&outcome, challenge.id);

    // Update challenge
    let challenge = &mut ctx.accounts.challenge;
    challenge.outcome = outcome;
    challenge.winner = winner;
    challenge.skill_answer = skill_answer;
    challenge.status = ChallengeStatus::Resolved;
    challenge.resolved_at = clock.unix_timestamp;

    // Update player stats
    let creator_player = &mut ctx.accounts.creator_player;
    let acceptor_player = &mut ctx.accounts.acceptor_player;

    creator_player.games_played = creator_player.games_played.checked_add(1)
        .ok_or(TokenMonkeyError::Overflow)?;
    acceptor_player.games_played = acceptor_player.games_played.checked_add(1)
        .ok_or(TokenMonkeyError::Overflow)?;

    if creator_wins {
        creator_player.wins = creator_player.wins.checked_add(1)
            .ok_or(TokenMonkeyError::Overflow)?;
        acceptor_player.losses = acceptor_player.losses.checked_add(1)
            .ok_or(TokenMonkeyError::Overflow)?;
    } else {
        acceptor_player.wins = acceptor_player.wins.checked_add(1)
            .ok_or(TokenMonkeyError::Overflow)?;
        creator_player.losses = creator_player.losses.checked_add(1)
            .ok_or(TokenMonkeyError::Overflow)?;
    }

    emit!(GameResolved {
        challenge_id: challenge.id,
        winner,
        loser,
        game_type: challenge.game_type as u8,
        outcome,
    });

    msg!("Challenge {} resolved. Winner: {}", challenge.id, winner);
    Ok(())
}
