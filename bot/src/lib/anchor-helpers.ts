import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { createHash } from 'crypto'
import { PROGRAM_ID } from '../config.js'

// PDA seeds (must match on-chain constants)
const CASINO_CONFIG_SEED = Buffer.from('casino_config')
const PLAYER_SEED = Buffer.from('player')
const CHALLENGE_SEED = Buffer.from('challenge')
const VAULT_SEED = Buffer.from('vault')

// PDA derivation helpers
export function findCasinoConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CASINO_CONFIG_SEED], PROGRAM_ID)
}

export function findPlayerAccount(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PLAYER_SEED, wallet.toBuffer()], PROGRAM_ID)
}

export function findChallenge(id: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([CHALLENGE_SEED, buf], PROGRAM_ID)
}

export function findVault(challengeId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(challengeId))
  return PublicKey.findProgramAddressSync([VAULT_SEED, buf], PROGRAM_ID)
}

// GameType enum mapping (matches Anchor IDL)
export const GameType = {
  Coinflip: { coinflip: {} },
  Dice: { dice: {} },
} as const

// Build game_params for coinflip: byte[0] = pick (0=heads, 1=tails)
export function coinflipParams(pick: 'heads' | 'tails'): number[] {
  const params = new Array(32).fill(0)
  params[0] = pick === 'heads' ? 0 : 1
  return params
}

// Build game_params for dice: bytes[0..2] = target u16 LE, byte[2] = direction (0=over, 1=under)
export function diceParams(target: number, direction: 'over' | 'under'): number[] {
  const params = new Array(32).fill(0)
  params[0] = target & 0xff
  params[1] = (target >> 8) & 0xff
  params[2] = direction === 'over' ? 0 : 1
  return params
}

// Compute skill answer: SHA-256(outcome || challenge_id_le_bytes)
export function computeSkillAnswer(outcome: Buffer | Uint8Array, challengeId: number): Buffer {
  const idBuffer = Buffer.alloc(8)
  idBuffer.writeBigUInt64LE(BigInt(challengeId))
  const preimage = Buffer.concat([Buffer.from(outcome), idBuffer])
  return createHash('sha256').update(preimage).digest()
}

// USDC amounts (6 decimals)
export function usdcAmount(dollars: number): BN {
  return new BN(Math.round(dollars * 1_000_000))
}

export function usdcDisplay(lamports: BN | number): string {
  const val = typeof lamports === 'number' ? lamports : lamports.toNumber()
  return (val / 1_000_000).toFixed(2)
}

// Parse challenge status from on-chain enum
export function parseStatus(status: any): string {
  if (status.open) return 'open'
  if (status.matched) return 'matched'
  if (status.resolved) return 'resolved'
  if (status.claimed) return 'claimed'
  if (status.cancelled) return 'cancelled'
  if (status.expired) return 'expired'
  return 'unknown'
}

// Parse game type from on-chain enum
export function parseGameType(gameType: any): 'coinflip' | 'dice' {
  if (gameType.coinflip !== undefined) return 'coinflip'
  if (gameType.dice !== undefined) return 'dice'
  return 'coinflip' // fallback
}
