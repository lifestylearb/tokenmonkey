use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::ChallengeCancelled;
use crate::state::{CasinoConfig, Challenge, ChallengeStatus};

#[derive(Accounts)]
pub struct CancelChallenge<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [CHALLENGE_SEED, challenge.id.to_le_bytes().as_ref()],
        bump = challenge.bump,
        constraint = challenge.status == ChallengeStatus::Open @ TokenMonkeyError::ChallengeNotOpen,
        constraint = challenge.creator == creator.key() @ TokenMonkeyError::Unauthorized,
    )]
    pub challenge: Account<'info, Challenge>,

    /// CHECK: PDA authority for the vault.
    #[account(
        seeds = [VAULT_SEED, challenge.id.to_le_bytes().as_ref()],
        bump = challenge.vault_bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.mint == usdc_mint.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = creator_token_account.owner == creator.key(),
        constraint = creator_token_account.mint == usdc_mint.key(),
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
    )]
    pub casino_config: Account<'info, CasinoConfig>,

    #[account(
        constraint = usdc_mint.key() == casino_config.usdc_mint @ TokenMonkeyError::InvalidUsdcMint,
    )]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CancelChallenge>) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    let amount = challenge.amount_usdc;

    // PDA signer seeds
    let challenge_id_bytes = challenge.id.to_le_bytes();
    let seeds = &[
        VAULT_SEED,
        challenge_id_bytes.as_ref(),
        &[challenge.vault_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Refund creator
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Update status
    let challenge = &mut ctx.accounts.challenge;
    challenge.status = ChallengeStatus::Cancelled;

    emit!(ChallengeCancelled {
        challenge_id: challenge.id,
        creator: ctx.accounts.creator.key(),
        refund_usdc: amount,
    });

    msg!("Challenge {} cancelled. Refunded {} USDC", challenge.id, amount);
    Ok(())
}
