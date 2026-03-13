use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::constants::*;
use crate::errors::TokenMonkeyError;
use crate::events::AgentRegistered;
use crate::state::{CasinoConfig, PlayerAccount};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = 8 + PlayerAccount::INIT_SPACE,
        seeds = [PLAYER_SEED, agent.key().as_ref()],
        bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(
        seeds = [CASINO_CONFIG_SEED],
        bump = casino_config.bump,
        constraint = !casino_config.paused @ TokenMonkeyError::CasinoPaused,
    )]
    pub casino_config: Account<'info, CasinoConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterAgent>,
    ai_proof_nonce: u64,
    ai_proof_hash: [u8; 32],
) -> Result<()> {
    // Verify AI proof: SHA-256(agent_pubkey || nonce) must have N leading zero bits
    let mut preimage = Vec::with_capacity(40);
    preimage.extend_from_slice(&ctx.accounts.agent.key().to_bytes());
    preimage.extend_from_slice(&ai_proof_nonce.to_le_bytes());
    let computed_hash = hash(&preimage);

    require!(
        computed_hash.to_bytes() == ai_proof_hash,
        TokenMonkeyError::InvalidAiProof
    );

    // Verify leading zeros
    let leading_zeros = count_leading_zero_bits(&ai_proof_hash);
    require!(
        leading_zeros >= AI_PROOF_DIFFICULTY as u32,
        TokenMonkeyError::InvalidAiProof
    );

    let clock = Clock::get()?;
    let player = &mut ctx.accounts.player_account;
    player.wallet = ctx.accounts.agent.key();
    player.total_wagered = 0;
    player.bets_placed = 0;
    player.wins = 0;
    player.losses = 0;
    player.games_played = 0;
    player.referred_by = Pubkey::default();
    player.referral_count = 0;
    player.registered_at = clock.unix_timestamp;
    player.last_played_at = 0;
    player.ai_proof_hash = ai_proof_hash;
    player.bump = ctx.bumps.player_account;

    // Generate referral code from first 8 bytes of hash(agent_pubkey)
    let ref_hash = hash(&ctx.accounts.agent.key().to_bytes());
    let mut referral_code = [0u8; 8];
    referral_code.copy_from_slice(&ref_hash.to_bytes()[..8]);
    player.referral_code = referral_code;

    emit!(AgentRegistered {
        wallet: player.wallet,
        referral_code,
        timestamp: clock.unix_timestamp,
    });

    msg!("Agent registered: {}", player.wallet);
    Ok(())
}

fn count_leading_zero_bits(bytes: &[u8; 32]) -> u32 {
    let mut count = 0u32;
    for &byte in bytes.iter() {
        if byte == 0 {
            count += 8;
        } else {
            count += byte.leading_zeros();
            break;
        }
    }
    count
}
