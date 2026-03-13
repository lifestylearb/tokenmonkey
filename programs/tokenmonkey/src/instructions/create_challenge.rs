use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::ChallengeCreated;
use crate::state::{CasinoConfig, Challenge, ChallengeStatus, GameType, PlayerAccount};

#[cfg(not(feature = "test-mode"))]
use std::str::FromStr;

#[derive(Accounts)]
pub struct CreateChallenge<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, creator.key().as_ref()],
        bump = creator_player.bump,
    )]
    pub creator_player: Account<'info, PlayerAccount>,

    #[account(
        mut,
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
        constraint = !casino_config.paused @ TokenMonkeyError::CasinoPaused,
    )]
    pub casino_config: Account<'info, CasinoConfig>,

    #[account(
        init,
        payer = creator,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [CHALLENGE_SEED, casino_config.total_challenges.to_le_bytes().as_ref()],
        bump,
    )]
    pub challenge: Account<'info, Challenge>,

    /// CHECK: PDA that will be the authority for the vault token account.
    #[account(
        seeds = [VAULT_SEED, casino_config.total_challenges.to_le_bytes().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key(),
        constraint = creator_token_account.mint == usdc_mint.key(),
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        constraint = usdc_mint.key() == casino_config.usdc_mint @ TokenMonkeyError::InvalidUsdcMint,
    )]
    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<CreateChallenge>,
    amount_usdc: u64,
    game_type: GameType,
    game_params: [u8; 32],
    randomness_seed: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.casino_config;

    require!(amount_usdc >= config.min_bet_usdc, TokenMonkeyError::BetTooLow);
    require!(amount_usdc <= config.max_bet_usdc, TokenMonkeyError::BetTooHigh);

    // Transfer USDC from creator to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.creator_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount_usdc,
    )?;

    // In production, validate the Switchboard randomness account.
    // The randomness_seed param holds the randomness account pubkey bytes.
    // The actual account must be passed as remaining_accounts[0].
    #[cfg(not(feature = "test-mode"))]
    {
        require!(
            !ctx.remaining_accounts.is_empty(),
            TokenMonkeyError::RandomnessNotRevealed
        );
        let randomness_info = &ctx.remaining_accounts[0];
        // Verify the pubkey matches what will be stored
        require!(
            randomness_info.key().to_bytes() == randomness_seed,
            TokenMonkeyError::RandomnessNotRevealed
        );
        // Verify the account is owned by the Switchboard On-Demand program
        let sb_program_id = Pubkey::from_str(SWITCHBOARD_ON_DEMAND_ID).unwrap();
        require!(
            *randomness_info.owner == sb_program_id,
            TokenMonkeyError::RandomnessNotRevealed
        );
    }

    let clock = Clock::get()?;
    let challenge_id = config.total_challenges;

    // Initialize challenge
    let challenge = &mut ctx.accounts.challenge;
    challenge.id = challenge_id;
    challenge.creator = ctx.accounts.creator.key();
    challenge.acceptor = Pubkey::default();
    challenge.amount_usdc = amount_usdc;
    challenge.game_type = game_type;
    challenge.game_params = game_params;
    challenge.status = ChallengeStatus::Open;
    challenge.vault_bump = ctx.bumps.vault_authority;
    challenge.randomness_seed = randomness_seed;
    challenge.outcome = [0u8; 32];
    challenge.winner = Pubkey::default();
    challenge.skill_answer = [0u8; 32];
    challenge.created_at = clock.unix_timestamp;
    challenge.expires_at = clock.unix_timestamp + CHALLENGE_EXPIRY_SECONDS;
    challenge.resolved_at = 0;
    challenge.claimed_at = 0;
    challenge.bump = ctx.bumps.challenge;

    // Update global stats
    config.total_challenges = config.total_challenges.checked_add(1)
        .ok_or(TokenMonkeyError::Overflow)?;
    config.total_volume_usdc = config.total_volume_usdc.checked_add(amount_usdc)
        .ok_or(TokenMonkeyError::Overflow)?;

    // Update player stats
    let player = &mut ctx.accounts.creator_player;
    player.bets_placed = player.bets_placed.checked_add(1)
        .ok_or(TokenMonkeyError::Overflow)?;
    player.total_wagered = player.total_wagered.checked_add(amount_usdc)
        .ok_or(TokenMonkeyError::Overflow)?;
    player.last_played_at = clock.unix_timestamp;

    emit!(ChallengeCreated {
        challenge_id,
        creator: challenge.creator,
        amount_usdc,
        game_type: game_type as u8,
        expires_at: challenge.expires_at,
    });

    msg!("Challenge {} created: {} USDC", challenge_id, amount_usdc);
    Ok(())
}
