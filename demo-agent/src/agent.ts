#!/usr/bin/env node
/**
 * TokenMonkey Demo Agent — "DegenMonkey"
 *
 * A standalone AI agent that autonomously creates and accepts P2P challenges
 * on the TokenMonkey protocol. Runs in a loop:
 *
 *   1. Check for open challenges → accept the best one
 *   2. If none available, create a new challenge
 *   3. Wait, repeat
 *
 * This serves two purposes:
 *   - Liquidity seeding: ensures there are always challenges to accept
 *   - Marketing demo: "Watch an AI agent gamble on Solana autonomously"
 *
 * Usage:
 *   AGENT_SECRET_KEY=<json_array> npm start
 *   or copy .env.example to .env and fill in values
 */

import 'dotenv/config'
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import {
  getAssociatedTokenAddress, getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── Config ─────────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')
const USDC_MINT = new PublicKey(process.env.USDC_MINT || 'BvgDGWCPQPMDhPPGoxAoKEXXbQfeejS2xFduN8nh6ZaH')

const LOOP_INTERVAL_MS = Number(process.env.LOOP_INTERVAL_MS || 30_000) // 30 seconds
const BET_AMOUNT_USDC = Number(process.env.BET_AMOUNT_USDC || 1) // $1 default
const MAX_OPEN_CHALLENGES = Number(process.env.MAX_OPEN_CHALLENGES || 3) // don't flood

const AGENT_NAME = process.env.AGENT_NAME || 'DegenMonkey'

// PDA seeds
const SEEDS = {
  CASINO_CONFIG: Buffer.from('casino_config'),
  PLAYER: Buffer.from('player'),
  CHALLENGE: Buffer.from('challenge'),
  VAULT: Buffer.from('vault'),
}

// ─── Helpers ────────────────────────────────────────────────────

function findCasinoConfig() { return PublicKey.findProgramAddressSync([SEEDS.CASINO_CONFIG], PROGRAM_ID) }
function findPlayerAccount(w: PublicKey) { return PublicKey.findProgramAddressSync([SEEDS.PLAYER, w.toBuffer()], PROGRAM_ID) }
function findChallenge(id: number) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([SEEDS.CHALLENGE, buf], PROGRAM_ID)
}
function findVault(id: number) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([SEEDS.VAULT, buf], PROGRAM_ID)
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] 🐵 ${AGENT_NAME}: ${msg}`)
}

function parseStatus(s: any): string {
  if (s.open) return 'open'; if (s.matched) return 'matched'; if (s.resolved) return 'resolved'
  if (s.claimed) return 'claimed'; if (s.cancelled) return 'cancelled'; if (s.expired) return 'expired'
  return 'unknown'
}

// ─── Agent ──────────────────────────────────────────────────────

class DegenMonkeyAgent {
  connection: Connection
  keypair: Keypair
  program: Program
  vaultCache = new Map<number, PublicKey>()
  myOpenChallenges = 0
  totalPlayed = 0
  totalWon = 0

  constructor() {
    const secretKey = process.env.AGENT_SECRET_KEY
    if (!secretKey) throw new Error('AGENT_SECRET_KEY env var required (JSON array of bytes)')
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)))
    this.connection = new Connection(RPC_URL, 'confirmed')
    const provider = new AnchorProvider(this.connection, new Wallet(this.keypair), { commitment: 'confirmed' })
    const idl = JSON.parse(readFileSync(join(__dirname, '..', '..', 'bot', 'src', 'idl', 'tokenmonkey.json'), 'utf-8'))
    this.program = new Program(idl, provider)
  }

  async getUsdcBalance(): Promise<number> {
    const ata = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey)
    try { const acc = await getAccount(this.connection, ata); return Number(acc.amount) / 1e6 } catch { return 0 }
  }

  async getSolBalance(): Promise<number> {
    return (await this.connection.getBalance(this.keypair.publicKey)) / LAMPORTS_PER_SOL
  }

  async ensureRegistered(): Promise<void> {
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    try {
      await (this.program.account as any).playerAccount.fetch(playerPda)
      log('Already registered ✅')
      return
    } catch {
      // Need to register
    }

    log('Mining AI proof-of-work...')
    const pubkeyBytes = this.keypair.publicKey.toBuffer()
    const preimage = Buffer.alloc(40)
    pubkeyBytes.copy(preimage, 0)
    const nonceBuf = Buffer.alloc(8)

    let nonce = 0
    let hash: Buffer = Buffer.alloc(32)
    for (; ; nonce++) {
      nonceBuf.writeBigUInt64LE(BigInt(nonce))
      nonceBuf.copy(preimage, 32)
      hash = createHash('sha256').update(preimage).digest()
      let zeroBits = 0
      for (const byte of hash) {
        if (byte === 0) { zeroBits += 8; continue }
        zeroBits += Math.clz32(byte) - 24; break
      }
      if (zeroBits >= 20) break
    }
    log(`Proof found: nonce=${nonce}`)

    // Ensure USDC ATA
    const ata = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey)
    try { await getAccount(this.connection, ata) } catch {
      const ix = createAssociatedTokenAccountInstruction(this.keypair.publicKey, ata, this.keypair.publicKey, USDC_MINT)
      await sendAndConfirmTransaction(this.connection, new Transaction().add(ix), [this.keypair])
    }

    const [casinoConfig] = findCasinoConfig()
    await (this.program.methods as any)
      .registerAgent(new BN(nonce), Array.from(hash))
      .accounts({ player: this.keypair.publicKey, playerAccount: playerPda, casinoConfig, systemProgram: SystemProgram.programId })
      .signers([this.keypair])
      .rpc()
    log('Registered ✅')
  }

  async getOpenChallenges(): Promise<any[]> {
    const all = await (this.program.account as any).challenge.all()
    return all.filter((a: any) => a.account.status.open !== undefined)
  }

  async createChallenge(): Promise<number | null> {
    const balance = await this.getUsdcBalance()
    if (balance < BET_AMOUNT_USDC) {
      log(`Insufficient USDC (${balance.toFixed(2)}). Need ${BET_AMOUNT_USDC} to create challenge.`)
      return null
    }

    const [casinoConfig] = findCasinoConfig()
    const config = await (this.program.account as any).casinoConfig.fetch(casinoConfig)
    const challengeId = (config as any).totalChallenges.toNumber()
    const [challengePda] = findChallenge(challengeId)
    const [vaultAuth] = findVault(challengeId)
    const vault = Keypair.generate()
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    const creatorAta = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey)

    // Random game choice
    const pick = Math.random() > 0.5 ? 'heads' : 'tails'
    const params = new Array(32).fill(0)
    params[0] = pick === 'heads' ? 0 : 1

    const seed = Array.from(createHash('sha256').update(`demo-${Date.now()}-${challengeId}`).digest())

    try {
      await (this.program.methods as any)
        .createChallenge(new BN(Math.round(BET_AMOUNT_USDC * 1e6)), { coinflip: {} }, params, seed)
        .accounts({
          creator: this.keypair.publicKey, creatorPlayer: playerPda, casinoConfig,
          challenge: challengePda, vaultAuthority: vaultAuth, vaultTokenAccount: vault.publicKey,
          creatorTokenAccount: creatorAta, usdcMint: USDC_MINT, systemProgram: SystemProgram.programId,
        })
        .signers([this.keypair, vault])
        .rpc()

      this.vaultCache.set(challengeId, vault.publicKey)
      log(`Created challenge #${challengeId}: ${BET_AMOUNT_USDC} USDC coinflip (${pick}) 🎲`)
      return challengeId
    } catch (err: any) {
      log(`Failed to create challenge: ${err.message}`)
      return null
    }
  }

  async acceptChallenge(challengeAccount: any): Promise<boolean> {
    const challenge = challengeAccount.account
    const challengeId = challenge.id.toNumber()
    const amount = challenge.amountUsdc.toNumber() / 1e6

    // Don't accept own challenges
    if (challenge.creator.toBase58() === this.keypair.publicKey.toBase58()) return false

    const balance = await this.getUsdcBalance()
    if (balance < amount) {
      log(`Can't accept #${challengeId}: need ${amount} USDC, have ${balance.toFixed(2)}`)
      return false
    }

    const [challengePda] = findChallenge(challengeId)
    const [vaultAuth] = findVault(challengeId)
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    const [casinoConfig] = findCasinoConfig()
    const acceptorAta = await getAssociatedTokenAddress(USDC_MINT, this.keypair.publicKey)

    const vaultAccounts = await this.connection.getTokenAccountsByOwner(vaultAuth, { mint: USDC_MINT })
    if (vaultAccounts.value.length === 0) return false

    try {
      await (this.program.methods as any)
        .acceptChallenge()
        .accounts({
          acceptor: this.keypair.publicKey, acceptorPlayer: playerPda,
          challenge: challengePda, vaultAuthority: vaultAuth,
          vaultTokenAccount: vaultAccounts.value[0].pubkey,
          acceptorTokenAccount: acceptorAta, casinoConfig, usdcMint: USDC_MINT,
        })
        .signers([this.keypair])
        .rpc()

      this.totalPlayed++
      log(`Accepted challenge #${challengeId} (${amount} USDC) ⚔️`)
      return true
    } catch (err: any) {
      log(`Failed to accept #${challengeId}: ${err.message}`)
      return false
    }
  }

  async tick(): Promise<void> {
    // Step 1: Look for open challenges to accept
    const openChallenges = await this.getOpenChallenges()
    const acceptable = openChallenges.filter(
      (c: any) => c.account.creator.toBase58() !== this.keypair.publicKey.toBase58()
    )

    // Count our own open challenges
    this.myOpenChallenges = openChallenges.filter(
      (c: any) => c.account.creator.toBase58() === this.keypair.publicKey.toBase58()
    ).length

    if (acceptable.length > 0) {
      // Accept a random one
      const target = acceptable[Math.floor(Math.random() * acceptable.length)]
      await this.acceptChallenge(target)
    } else if (this.myOpenChallenges < MAX_OPEN_CHALLENGES) {
      // No challenges to accept — create one for others to play
      await this.createChallenge()
    } else {
      log(`Waiting... (${openChallenges.length} open, ${this.myOpenChallenges} mine)`)
    }
  }

  async run(): Promise<void> {
    console.log('')
    console.log('╔═══════════════════════════════════════════════════╗')
    console.log('║   🐵 TokenMonkey Demo Agent — "DegenMonkey"      ║')
    console.log('║   Autonomous P2P AI Challenger on Solana          ║')
    console.log('╚═══════════════════════════════════════════════════╝')
    console.log('')
    log(`Wallet:  ${this.keypair.publicKey.toBase58()}`)
    log(`RPC:     ${RPC_URL}`)
    log(`Bet:     ${BET_AMOUNT_USDC} USDC per challenge`)
    log(`Loop:    every ${LOOP_INTERVAL_MS / 1000}s`)
    console.log('')

    const sol = await this.getSolBalance()
    const usdc = await this.getUsdcBalance()
    log(`Balance: ${sol.toFixed(4)} SOL, ${usdc.toFixed(2)} USDC`)

    if (sol < 0.005) {
      log('⚠️  Low SOL balance — need at least 0.005 SOL for transaction fees')
      return
    }

    await this.ensureRegistered()

    log('Starting autonomous challenge loop...\n')

    // Main loop
    while (true) {
      try {
        await this.tick()
      } catch (err: any) {
        log(`Error in tick: ${err.message}`)
      }

      await new Promise((r) => setTimeout(r, LOOP_INTERVAL_MS))
    }
  }
}

// ─── Entry ──────────────────────────────────────────────────────

const agent = new DegenMonkeyAgent()
agent.run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
