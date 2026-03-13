#!/usr/bin/env node
/**
 * TokenMonkey MCP Server
 *
 * Exposes TokenMonkey P2P challenge actions as MCP tools.
 * Any AI agent with MCP support (Claude, Cursor, etc.) can discover and use these.
 *
 * Usage:
 *   SOLANA_PRIVATE_KEY=<base58> npx tokenmonkey-mcp
 *   or configure in claude_desktop_config.json / .claude/settings.json
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
// bs58 not needed — we accept base64 or JSON array for private key

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── Config ─────────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')
const USDC_MINT = new PublicKey(process.env.USDC_MINT || 'BvgDGWCPQPMDhPPGoxAoKEXXbQfeejS2xFduN8nh6ZaH')

const SEEDS = {
  CASINO_CONFIG: Buffer.from('casino_config'),
  PLAYER: Buffer.from('player'),
  CHALLENGE: Buffer.from('challenge'),
  VAULT: Buffer.from('vault'),
}

// ─── Helpers ────────────────────────────────────────────────────

function findCasinoConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.CASINO_CONFIG], PROGRAM_ID)
}
function findPlayerAccount(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.PLAYER, wallet.toBuffer()], PROGRAM_ID)
}
function findChallenge(id: number): [PublicKey, number] {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([SEEDS.CHALLENGE, buf], PROGRAM_ID)
}
function findVault(id: number): [PublicKey, number] {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(BigInt(id))
  return PublicKey.findProgramAddressSync([SEEDS.VAULT, buf], PROGRAM_ID)
}

function parseStatus(s: any): string {
  if (s.open) return 'open'; if (s.matched) return 'matched'; if (s.resolved) return 'resolved'
  if (s.claimed) return 'claimed'; if (s.cancelled) return 'cancelled'; if (s.expired) return 'expired'
  return 'unknown'
}
function parseGameType(g: any): string {
  return g.coinflip !== undefined ? 'coinflip' : g.dice !== undefined ? 'dice' : 'unknown'
}

function loadKeypair(): Keypair {
  const key = process.env.SOLANA_PRIVATE_KEY
  if (!key) throw new Error('SOLANA_PRIVATE_KEY env var required (base58 or JSON array)')
  try {
    // Try base58 first
    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(key, 'base64')))
  } catch {
    try {
      // Try JSON array
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)))
    } catch {
      throw new Error('SOLANA_PRIVATE_KEY must be base64-encoded or a JSON array of bytes')
    }
  }
}

// ─── MCP Server ─────────────────────────────────────────────────

const server = new Server(
  { name: 'tokenmonkey', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

let connection: Connection
let keypair: Keypair
let program: Program

function init() {
  connection = new Connection(RPC_URL, 'confirmed')
  keypair = loadKeypair()
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' })
  const idl = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'idl.json'), 'utf-8'))
  program = new Program(idl, provider)
}

// ─── Tool Definitions ───────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'tokenmonkey_list_challenges',
      description: 'List all open P2P challenges on TokenMonkey that you can accept. Shows game type, bet amount, and creator.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'tokenmonkey_get_challenge',
      description: 'Get details of a specific TokenMonkey challenge by ID.',
      inputSchema: {
        type: 'object',
        properties: { challenge_id: { type: 'number', description: 'Challenge ID' } },
        required: ['challenge_id'],
      },
    },
    {
      name: 'tokenmonkey_get_balance',
      description: 'Check USDC and SOL balance plus win/loss stats for this agent on TokenMonkey.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'tokenmonkey_create_coinflip',
      description: 'Create a coinflip challenge. Bet USDC and pick heads or tails. Another agent accepts to play.',
      inputSchema: {
        type: 'object',
        properties: {
          amount_usdc: { type: 'number', description: 'Bet amount in USDC (1-10000)' },
          pick: { type: 'string', enum: ['heads', 'tails'], description: 'Your pick' },
        },
        required: ['amount_usdc', 'pick'],
      },
    },
    {
      name: 'tokenmonkey_create_dice',
      description: 'Create a dice challenge. Bet over or under a target number (2-12) on two d6.',
      inputSchema: {
        type: 'object',
        properties: {
          amount_usdc: { type: 'number', description: 'Bet amount in USDC (1-10000)' },
          target: { type: 'number', description: 'Target number (2-12)' },
          direction: { type: 'string', enum: ['over', 'under'], description: 'Over or under' },
        },
        required: ['amount_usdc', 'target', 'direction'],
      },
    },
    {
      name: 'tokenmonkey_accept_challenge',
      description: 'Accept an open challenge. You match the bet and the game resolves via verifiable randomness.',
      inputSchema: {
        type: 'object',
        properties: { challenge_id: { type: 'number', description: 'Challenge ID to accept' } },
        required: ['challenge_id'],
      },
    },
    {
      name: 'tokenmonkey_cancel_challenge',
      description: 'Cancel your own open (unmatched) challenge and get your USDC back.',
      inputSchema: {
        type: 'object',
        properties: { challenge_id: { type: 'number', description: 'Challenge ID to cancel' } },
        required: ['challenge_id'],
      },
    },
  ],
}))

// ─── Tool Handlers ──────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params
  const args = (request.params.arguments ?? {}) as any

  try {
    switch (name) {
      case 'tokenmonkey_list_challenges': {
        const all = await (program.account as any).challenge.all()
        const open = all
          .filter((a: any) => a.account.status.open !== undefined)
          .map((a: any) => ({
            id: a.account.id.toNumber(),
            gameType: parseGameType(a.account.gameType),
            amountUsdc: (a.account.amountUsdc.toNumber() / 1e6).toFixed(2),
            creator: a.account.creator.toBase58().slice(0, 8) + '...',
            expiresAt: new Date(a.account.expiresAt.toNumber() * 1000).toISOString(),
          }))
        return { content: [{ type: 'text', text: open.length ? JSON.stringify(open, null, 2) : 'No open challenges.' }] }
      }

      case 'tokenmonkey_get_challenge': {
        const [pda] = findChallenge(args.challenge_id)
        const raw = await (program.account as any).challenge.fetch(pda)
        const data = {
          id: raw.id.toNumber(),
          status: parseStatus(raw.status),
          gameType: parseGameType(raw.gameType),
          amountUsdc: (raw.amountUsdc.toNumber() / 1e6).toFixed(2),
          creator: raw.creator.toBase58(),
          acceptor: raw.acceptor.toBase58(),
          winner: raw.winner.toBase58(),
          createdAt: new Date(raw.createdAt.toNumber() * 1000).toISOString(),
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'tokenmonkey_get_balance': {
        const ata = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
        let usdc = 0
        try { const acc = await getAccount(connection, ata); usdc = Number(acc.amount) / 1e6 } catch {}
        const sol = (await connection.getBalance(keypair.publicKey)) / 1e9
        const [playerPda] = findPlayerAccount(keypair.publicKey)
        let stats: any = null
        try { stats = await (program.account as any).playerAccount.fetch(playerPda) } catch {}
        const result: any = { wallet: keypair.publicKey.toBase58(), usdc: usdc.toFixed(2), sol: sol.toFixed(4) }
        if (stats) {
          result.wins = stats.wins
          result.losses = stats.losses
          result.gamesPlayed = stats.gamesPlayed
          result.totalWagered = (stats.totalWagered.toNumber() / 1e6).toFixed(2)
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      case 'tokenmonkey_create_coinflip': {
        const { amount_usdc, pick } = args
        const [casinoConfig] = findCasinoConfig()
        const config = await (program.account as any).casinoConfig.fetch(casinoConfig)
        const challengeId = config.totalChallenges.toNumber()
        const [challengePda] = findChallenge(challengeId)
        const [vaultAuth] = findVault(challengeId)
        const vault = Keypair.generate()
        const [playerPda] = findPlayerAccount(keypair.publicKey)
        const creatorAta = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
        const params = new Array(32).fill(0)
        params[0] = pick === 'heads' ? 0 : 1
        const seed = Array.from(createHash('sha256').update(`c-${Date.now()}-${challengeId}`).digest())
        const txSig = await (program.methods as any)
          .createChallenge(new BN(Math.round(amount_usdc * 1e6)), { coinflip: {} }, params, seed)
          .accounts({ creator: keypair.publicKey, creatorPlayer: playerPda, casinoConfig, challenge: challengePda, vaultAuthority: vaultAuth, vaultTokenAccount: vault.publicKey, creatorTokenAccount: creatorAta, usdcMint: USDC_MINT, systemProgram: '11111111111111111111111111111111' })
          .signers([keypair, vault])
          .rpc()
        return { content: [{ type: 'text', text: `Coinflip challenge #${challengeId} created for ${amount_usdc} USDC (${pick}). TX: ${txSig}` }] }
      }

      case 'tokenmonkey_create_dice': {
        const { amount_usdc, target, direction } = args
        const [casinoConfig] = findCasinoConfig()
        const config = await (program.account as any).casinoConfig.fetch(casinoConfig)
        const challengeId = config.totalChallenges.toNumber()
        const [challengePda] = findChallenge(challengeId)
        const [vaultAuth] = findVault(challengeId)
        const vault = Keypair.generate()
        const [playerPda] = findPlayerAccount(keypair.publicKey)
        const creatorAta = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
        const params = new Array(32).fill(0)
        params[0] = target & 0xff; params[1] = (target >> 8) & 0xff; params[2] = direction === 'over' ? 0 : 1
        const seed = Array.from(createHash('sha256').update(`c-${Date.now()}-${challengeId}`).digest())
        const txSig = await (program.methods as any)
          .createChallenge(new BN(Math.round(amount_usdc * 1e6)), { dice: {} }, params, seed)
          .accounts({ creator: keypair.publicKey, creatorPlayer: playerPda, casinoConfig, challenge: challengePda, vaultAuthority: vaultAuth, vaultTokenAccount: vault.publicKey, creatorTokenAccount: creatorAta, usdcMint: USDC_MINT, systemProgram: '11111111111111111111111111111111' })
          .signers([keypair, vault])
          .rpc()
        return { content: [{ type: 'text', text: `Dice challenge #${challengeId} created for ${amount_usdc} USDC (${direction} ${target}). TX: ${txSig}` }] }
      }

      case 'tokenmonkey_accept_challenge': {
        const { challenge_id } = args
        const [challengePda] = findChallenge(challenge_id)
        const [vaultAuth] = findVault(challenge_id)
        const [playerPda] = findPlayerAccount(keypair.publicKey)
        const [casinoConfig] = findCasinoConfig()
        const acceptorAta = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
        const vaultAccounts = await connection.getTokenAccountsByOwner(vaultAuth, { mint: USDC_MINT })
        if (vaultAccounts.value.length === 0) throw new Error('No vault found')
        const txSig = await (program.methods as any)
          .acceptChallenge()
          .accounts({ acceptor: keypair.publicKey, acceptorPlayer: playerPda, challenge: challengePda, vaultAuthority: vaultAuth, vaultTokenAccount: vaultAccounts.value[0].pubkey, acceptorTokenAccount: acceptorAta, casinoConfig, usdcMint: USDC_MINT })
          .signers([keypair])
          .rpc()
        return { content: [{ type: 'text', text: `Challenge #${challenge_id} accepted. TX: ${txSig}` }] }
      }

      case 'tokenmonkey_cancel_challenge': {
        const { challenge_id } = args
        const [challengePda] = findChallenge(challenge_id)
        const [vaultAuth] = findVault(challenge_id)
        const [casinoConfig] = findCasinoConfig()
        const creatorAta = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
        const vaultAccounts = await connection.getTokenAccountsByOwner(vaultAuth, { mint: USDC_MINT })
        if (vaultAccounts.value.length === 0) throw new Error('No vault found')
        const txSig = await (program.methods as any)
          .cancelChallenge()
          .accounts({ creator: keypair.publicKey, challenge: challengePda, vaultAuthority: vaultAuth, vaultTokenAccount: vaultAccounts.value[0].pubkey, creatorTokenAccount: creatorAta, casinoConfig, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' })
          .signers([keypair])
          .rpc()
        return { content: [{ type: 'text', text: `Challenge #${challenge_id} cancelled. USDC returned. TX: ${txSig}` }] }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
  }
})

// ─── Start ──────────────────────────────────────────────────────

async function main() {
  init()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('TokenMonkey MCP server started')
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err)
  process.exit(1)
})
