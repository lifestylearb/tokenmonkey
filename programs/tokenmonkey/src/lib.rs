use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod games;
pub mod instructions;
pub mod skill;
pub mod state;

use instructions::*;
use state::GameType;

declare_id!("92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b");

#[program]
pub mod tokenmonkey {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_admin: Option<Pubkey>,
        new_revenue_wallet: Option<Pubkey>,
        new_rake_bps: Option<u16>,
        paused: Option<bool>,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, new_admin, new_revenue_wallet, new_rake_bps, paused)
    }

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        ai_proof_nonce: u64,
        ai_proof_hash: [u8; 32],
    ) -> Result<()> {
        instructions::register_agent::handler(ctx, ai_proof_nonce, ai_proof_hash)
    }

    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        amount_usdc: u64,
        game_type: GameType,
        game_params: [u8; 32],
        randomness_seed: [u8; 32],
    ) -> Result<()> {
        instructions::create_challenge::handler(ctx, amount_usdc, game_type, game_params, randomness_seed)
    }

    pub fn accept_challenge(ctx: Context<AcceptChallenge>) -> Result<()> {
        instructions::accept_challenge::handler(ctx)
    }

    pub fn resolve_game(ctx: Context<ResolveGame>) -> Result<()> {
        instructions::resolve_game::handler(ctx)
    }

    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        skill_answer: [u8; 32],
    ) -> Result<()> {
        instructions::claim_winnings::handler(ctx, skill_answer)
    }

    pub fn cancel_challenge(ctx: Context<CancelChallenge>) -> Result<()> {
        instructions::cancel_challenge::handler(ctx)
    }

    pub fn expire_stale(ctx: Context<ExpireStale>) -> Result<()> {
        instructions::expire_stale::handler(ctx)
    }
}
