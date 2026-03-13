import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { createHash } from 'crypto'
import { PROGRAM_ID, SEEDS, AI_PROOF_DIFFICULTY } from './constants.js'

// ─── PDA Derivation ──────────────────────────────────────────────

export function findCasinoConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.CASINO_CONFIG], PROGRAM_ID)
}

export function findPlayerAccount(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.PLAYER, wallet.toBuffer()], PROGRAM_ID)
}

export function findChallenge(id: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([SEEDS.CHALLENGE, buf], PROGRAM_ID)
}

export function findVault(challengeId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(challengeId))
  return PublicKey.findProgramAddressSync([SEEDS.VAULT, buf], PROGRAM_ID)
}

// ─── Game Params ────────────────────────────────────────────────

export function coinflipParams(pick: 'heads' | 'tails'): number[] {
  const params = new Array(32).fill(0)
  params[0] = pick === 'heads' ? 0 : 1
  return params
}

export function diceParams(target: number, direction: 'over' | 'under'): number[] {
  const params = new Array(32).fill(0)
  params[0] = target & 0xff
  params[1] = (target >> 8) & 0xff
  params[2] = direction === 'over' ? 0 : 1
  return params
}

// ─── USDC Amounts ───────────────────────────────────────────────

export function usdcToLamports(dollars: number): BN {
  return new BN(Math.round(dollars * 1_000_000))
}

export function lamportsToUsdc(lamports: BN | number): number {
  const val = typeof lamports === 'number' ? lamports : lamports.toNumber()
  return val / 1_000_000
}

// ─── Skill Answer ───────────────────────────────────────────────

export function computeSkillAnswer(outcome: Buffer | Uint8Array, challengeId: number): Buffer {
  const idBuffer = Buffer.alloc(8)
  idBuffer.writeBigUInt64LE(BigInt(challengeId))
  const preimage = Buffer.concat([Buffer.from(outcome), idBuffer])
  return createHash('sha256').update(preimage).digest()
}

// ─── AI Proof of Work ───────────────────────────────────────────

export interface AiProof {
  nonce: number
  hash: number[]
}

/**
 * Mine an AI proof-of-work for agent registration.
 * Finds a nonce where SHA-256(pubkey || nonce_le_u64) has `difficulty` leading zero bits.
 */
export function mineAiProof(pubkey: PublicKey, difficulty: number = AI_PROOF_DIFFICULTY): AiProof {
  const pubkeyBytes = pubkey.toBuffer()
  const nonceBuf = Buffer.alloc(8)
  const preimage = Buffer.alloc(40) // 32 pubkey + 8 nonce
  pubkeyBytes.copy(preimage, 0)

  for (let nonce = 0; ; nonce++) {
    nonceBuf.writeBigUInt64LE(BigInt(nonce))
    nonceBuf.copy(preimage, 32)

    const hash = createHash('sha256').update(preimage).digest()

    // Check leading zero bits
    let zeroBits = 0
    for (const byte of hash) {
      if (byte === 0) { zeroBits += 8; continue }
      zeroBits += Math.clz32(byte) - 24
      break
    }

    if (zeroBits >= difficulty) {
      return { nonce, hash: Array.from(hash) }
    }
  }
}

// ─── Status Parsing ─────────────────────────────────────────────

export function parseStatus(status: any): string {
  if (status.open) return 'open'
  if (status.matched) return 'matched'
  if (status.resolved) return 'resolved'
  if (status.claimed) return 'claimed'
  if (status.cancelled) return 'cancelled'
  if (status.expired) return 'expired'
  return 'unknown'
}

export function parseGameType(gameType: any): 'coinflip' | 'dice' {
  if (gameType.coinflip !== undefined) return 'coinflip'
  if (gameType.dice !== undefined) return 'dice'
  return 'coinflip'
}
