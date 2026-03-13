use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::WinningsClaimed;
use crate::skill;
use crate::state::{CasinoConfig, Challenge, ChallengeStatus};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        seeds = [CHALLENGE_SEED, challenge.id.to_le_bytes().as_ref()],
        bump = challenge.bump,
        constraint = challenge.status == ChallengeStatus::Resolved @ TokenMonkeyError::ChallengeNotResolved,
        constraint = challenge.winner == winner.key() @ TokenMonkeyError::NotWinner,
    )]
    pub challenge: Box<Account<'info, Challenge>>,

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
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = winner_token_account.owner == winner.key(),
        constraint = winner_token_account.mint == usdc_mint.key(),
    )]
    pub winner_token_account: Box<Account<'info, TokenAccount>>,

    /// Revenue wallet's USDC token account — rake goes here directly.
    #[account(
        mut,
        constraint = revenue_token_account.owner == casino_config.revenue_wallet,
        constraint = revenue_token_account.mint == usdc_mint.key(),
    )]
    pub revenue_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
    )]
    pub casino_config: Box<Account<'info, CasinoConfig>>,

    #[account(
        constraint = usdc_mint.key() == casino_config.usdc_mint @ TokenMonkeyError::InvalidUsdcMint,
    )]
    pub usdc_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimWinnings>, skill_answer: [u8; 32]) -> Result<()> {
    let challenge = &ctx.accounts.challenge;

    // Verify skill answer
    require!(
        skill::verify_skill_answer(&challenge.skill_answer, &skill_answer),
        TokenMonkeyError::InvalidSkillAnswer
    );

    // Calculate payout and rake
    let pot = challenge.amount_usdc.checked_mul(2)
        .ok_or(TokenMonkeyError::Overflow)?;
    let rake = (pot as u128)
        .checked_mul(ctx.accounts.casino_config.rake_bps as u128)
        .ok_or(TokenMonkeyError::Overflow)?
        .checked_div(10_000)
        .ok_or(TokenMonkeyError::Overflow)? as u64;
    let payout = pot.checked_sub(rake)
        .ok_or(TokenMonkeyError::Overflow)?;

    // PDA signer seeds for vault authority
    let challenge_id_bytes = challenge.id.to_le_bytes();
    let seeds = &[
        VAULT_SEED,
        challenge_id_bytes.as_ref(),
        &[challenge.vault_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer payout to winner
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    // Transfer rake directly to revenue wallet
    if rake > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.revenue_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            rake,
        )?;
    }

    // Update challenge
    let clock = Clock::get()?;
    let challenge = &mut ctx.accounts.challenge;
    challenge.status = ChallengeStatus::Claimed;
    challenge.claimed_at = clock.unix_timestamp;

    // Update global rake stats
    let config = &mut ctx.accounts.casino_config;
    config.total_rake_collected = config.total_rake_collected.checked_add(rake)
        .ok_or(TokenMonkeyError::Overflow)?;

    emit!(WinningsClaimed {
        challenge_id: challenge.id,
        winner: ctx.accounts.winner.key(),
        payout_usdc: payout,
        rake_usdc: rake,
    });

    msg!("Challenge {} claimed. Payout: {} USDC, Rake: {} USDC", challenge.id, payout, rake);
    Ok(())
}
