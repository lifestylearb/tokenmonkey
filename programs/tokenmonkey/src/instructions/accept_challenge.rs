use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::ChallengeAccepted;
use crate::state::{CasinoConfig, Challenge, ChallengeStatus, PlayerAccount};

#[derive(Accounts)]
pub struct AcceptChallenge<'info> {
    #[account(mut)]
    pub acceptor: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, acceptor.key().as_ref()],
        bump = acceptor_player.bump,
    )]
    pub acceptor_player: Account<'info, PlayerAccount>,

    #[account(
        mut,
        seeds = [CHALLENGE_SEED, challenge.id.to_le_bytes().as_ref()],
        bump = challenge.bump,
        constraint = challenge.status == ChallengeStatus::Open @ TokenMonkeyError::ChallengeNotOpen,
        constraint = challenge.creator != acceptor.key() @ TokenMonkeyError::CannotAcceptOwnChallenge,
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        constraint = vault_token_account.mint == usdc_mint.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = acceptor_token_account.owner == acceptor.key(),
        constraint = acceptor_token_account.mint == usdc_mint.key(),
    )]
    pub acceptor_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
        constraint = !casino_config.paused @ TokenMonkeyError::CasinoPaused,
    )]
    pub casino_config: Account<'info, CasinoConfig>,

    #[account(
        constraint = usdc_mint.key() == casino_config.usdc_mint @ TokenMonkeyError::InvalidUsdcMint,
    )]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<AcceptChallenge>) -> Result<()> {
    let clock = Clock::get()?;
    let challenge = &ctx.accounts.challenge;

    // Check not expired
    require!(
        clock.unix_timestamp < challenge.expires_at,
        TokenMonkeyError::ChallengeExpired
    );

    let amount = challenge.amount_usdc;

    // Transfer matching USDC from acceptor to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.acceptor_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.acceptor.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        amount,
    )?;

    // Update challenge
    let challenge = &mut ctx.accounts.challenge;
    challenge.acceptor = ctx.accounts.acceptor.key();
    challenge.status = ChallengeStatus::Matched;

    // Update acceptor player stats
    let player = &mut ctx.accounts.acceptor_player;
    player.bets_placed = player.bets_placed.checked_add(1)
        .ok_or(TokenMonkeyError::Overflow)?;
    player.total_wagered = player.total_wagered.checked_add(amount)
        .ok_or(TokenMonkeyError::Overflow)?;
    player.last_played_at = clock.unix_timestamp;

    emit!(ChallengeAccepted {
        challenge_id: challenge.id,
        acceptor: ctx.accounts.acceptor.key(),
        amount_usdc: amount,
    });

    msg!("Challenge {} accepted by {}", challenge.id, ctx.accounts.acceptor.key());
    Ok(())
}
