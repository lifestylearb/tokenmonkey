use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

use crate::constants::*;
use crate::state::CasinoConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + CasinoConfig::INIT_SPACE,
        seeds = [CASINO_CONFIG_SEED],
        bump,
    )]
    pub casino_config: Account<'info, CasinoConfig>,

    pub usdc_mint: Account<'info, Mint>,

    /// CHECK: This is the revenue wallet that receives rake. Validated by admin at init.
    pub revenue_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = revenue_wallet,
    )]
    pub revenue_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.casino_config;
    config.admin = ctx.accounts.admin.key();
    config.revenue_wallet = ctx.accounts.revenue_wallet.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.rake_bps = DEFAULT_RAKE_BPS;
    config.min_bet_usdc = MIN_BET_USDC;
    config.max_bet_usdc = MAX_BET_USDC;
    config.paused = false;
    config.total_challenges = 0;
    config.total_volume_usdc = 0;
    config.total_rake_collected = 0;
    config.bump = ctx.bumps.casino_config;

    msg!("TokenMonkey Casino initialized. Revenue wallet: {}", config.revenue_wallet);
    Ok(())
}
