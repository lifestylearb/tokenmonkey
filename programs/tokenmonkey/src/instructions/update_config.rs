use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::state::CasinoConfig;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = admin.key() == casino_config.admin @ TokenMonkeyError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
    )]
    pub casino_config: Account<'info, CasinoConfig>,
}

pub fn handler(
    ctx: Context<UpdateConfig>,
    new_admin: Option<Pubkey>,
    new_revenue_wallet: Option<Pubkey>,
    new_rake_bps: Option<u16>,
    paused: Option<bool>,
) -> Result<()> {
    let config = &mut ctx.accounts.casino_config;

    if let Some(admin) = new_admin {
        msg!("Admin changed: {} -> {}", config.admin, admin);
        config.admin = admin;
    }

    if let Some(revenue_wallet) = new_revenue_wallet {
        msg!("Revenue wallet changed: {} -> {}", config.revenue_wallet, revenue_wallet);
        config.revenue_wallet = revenue_wallet;
    }

    if let Some(rake_bps) = new_rake_bps {
        require!(rake_bps <= MAX_RAKE_BPS, TokenMonkeyError::RakeTooHigh);
        msg!("Rake changed: {} -> {} bps", config.rake_bps, rake_bps);
        config.rake_bps = rake_bps;
    }

    if let Some(paused) = paused {
        msg!("Paused changed: {} -> {}", config.paused, paused);
        config.paused = paused;
    }

    Ok(())
}
