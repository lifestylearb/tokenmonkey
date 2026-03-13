import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token'
import idl from './idl.json'

export const PROGRAM_ID = new PublicKey('92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')

// PDA seeds (must match on-chain constants)
const CASINO_CONFIG_SEED = Buffer.from('casino_config')
const PLAYER_SEED = Buffer.from('player')
const CHALLENGE_SEED = Buffer.from('challenge')
const VAULT_SEED = Buffer.from('vault')

// Revenue wallet
export const REVENUE_WALLET = new PublicKey('DjpXqT4V5VuWsH5cTTx6VnJWeivCXVCTM3rucMWzjhuj')

// Devnet USDC — will be set after initialization
let USDC_MINT: PublicKey | null = null

export function setUsdcMint(mint: PublicKey) {
  USDC_MINT = mint
}

export function getUsdcMint(): PublicKey {
  if (!USDC_MINT) throw new Error('USDC mint not initialized — call setUsdcMint first')
  return USDC_MINT
}

// PDA derivation helpers
export function findCasinoConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CASINO_CONFIG_SEED],
    PROGRAM_ID,
  )
}

export function findPlayerAccount(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PLAYER_SEED, wallet.toBuffer()],
    PROGRAM_ID,
  )
}

export function findChallenge(id: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync(
    [CHALLENGE_SEED, buf],
    PROGRAM_ID,
  )
}

export function findVault(challengeId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(challengeId))
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, buf],
    PROGRAM_ID,
  )
}

// Get Anchor program instance
export function getProgram(provider: AnchorProvider): Program {
  return new Program(idl as any, provider)
}

// GameType enum mapping
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
export async function computeSkillAnswer(outcome: Uint8Array, challengeId: number): Promise<Uint8Array> {
  const idBuf = new Uint8Array(8)
  const view = new DataView(idBuf.buffer)
  view.setBigUint64(0, BigInt(challengeId), true) // little-endian
  const preimage = new Uint8Array([...outcome, ...idBuf])
  const hash = await crypto.subtle.digest('SHA-256', preimage)
  return new Uint8Array(hash)
}

// USDC amounts (6 decimals)
export function usdcAmount(dollars: number): BN {
  return new BN(Math.round(dollars * 1_000_000))
}

export function usdcDisplay(lamports: BN | number): string {
  const val = typeof lamports === 'number' ? lamports : lamports.toNumber()
  return (val / 1_000_000).toFixed(2)
}
