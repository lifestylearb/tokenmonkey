import { PublicKey } from '@solana/web3.js'

/** TokenMonkey program ID (same on devnet and mainnet) */
export const PROGRAM_ID = new PublicKey('92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')

/** Devnet test USDC mint */
export const DEVNET_USDC_MINT = new PublicKey('BvgDGWCPQPMDhPPGoxAoKEXXbQfeejS2xFduN8nh6ZaH')

/** Mainnet USDC mint */
export const MAINNET_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

/** Default Solana devnet RPC */
export const DEVNET_RPC = 'https://api.devnet.solana.com'

/** PDA seeds — must match on-chain program */
export const SEEDS = {
  CASINO_CONFIG: Buffer.from('casino_config'),
  PLAYER: Buffer.from('player'),
  CHALLENGE: Buffer.from('challenge'),
  VAULT: Buffer.from('vault'),
} as const

/** AI proof difficulty — 20 leading zero bits (~1M hashes) */
export const AI_PROOF_DIFFICULTY = 20
