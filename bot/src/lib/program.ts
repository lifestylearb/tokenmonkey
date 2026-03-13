import { Program, AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token'
import { createHash } from 'crypto'
import {
  connection,
  PROGRAM_ID,
  USDC_MINT,
  CASINO_CONFIG_PDA,
  REVENUE_WALLET,
  resolverKeypair,
  SOL_FUNDING_AMOUNT,
  VRF_ENABLED,
} from '../config.js'
import {
  createAndCommitRandomness,
  getRevealIx,
} from './switchboard.js'
import {
  findCasinoConfig,
  findPlayerAccount,
  findChallenge,
  findVault,
  GameType,
  computeSkillAnswer,
  parseStatus,
  parseGameType,
  usdcDisplay,
} from './anchor-helpers.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const idl = JSON.parse(readFileSync(path.join(__dirname, '..', 'idl', 'tokenmonkey.json'), 'utf-8'))

// Vault token account cache: challengeId -> PublicKey
const vaultCache = new Map<number, PublicKey>()

// Switchboard randomness account cache: challengeId -> PublicKey (VRF mode only)
const rngCache = new Map<number, PublicKey>()

function getProvider(payer: Keypair): AnchorProvider {
  const wallet = new Wallet(payer)
  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
}

function getProgram(payer: Keypair): Program {
  const provider = getProvider(payer)
  return new Program(idl as any, provider)
}

// ─── Fund new wallet with SOL (from resolver) ─────────────────────
export async function fundNewWallet(target: PublicKey): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: resolverKeypair.publicKey,
      toPubkey: target,
      lamports: SOL_FUNDING_AMOUNT,
    })
  )
  return sendAndConfirmTransaction(connection, tx, [resolverKeypair])
}

// ─── Ensure USDC ATA exists ───────────────────────────────────────
export async function ensureUsdcAta(
  owner: PublicKey,
  payer: Keypair = resolverKeypair,
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner)
  try {
    await getAccount(connection, ata)
  } catch {
    // ATA doesn't exist — create it
    const ix = createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, USDC_MINT)
    const tx = new Transaction().add(ix)
    await sendAndConfirmTransaction(connection, tx, [payer])
  }
  return ata
}

// ─── Register Agent ───────────────────────────────────────────────
export async function registerAgent(
  agentKeypair: Keypair,
  nonce: bigint,
  hash: Buffer,
): Promise<string> {
  const program = getProgram(agentKeypair)
  const [playerPda] = findPlayerAccount(agentKeypair.publicKey)
  const [casinoConfig] = findCasinoConfig()

  return program.methods
    .registerAgent(new BN(nonce.toString()), Array.from(hash) as any)
    .accounts({
      agent: agentKeypair.publicKey,
      playerAccount: playerPda,
      casinoConfig,
      systemProgram: SystemProgram.programId,
    })
    .signers([agentKeypair])
    .rpc()
}

// ─── Create Challenge ─────────────────────────────────────────────
export async function createChallenge(
  creatorKeypair: Keypair,
  amountUsdc: BN,
  gameType: typeof GameType[keyof typeof GameType],
  gameParams: number[],
): Promise<{ txSig: string; challengeId: number }> {
  const program = getProgram(creatorKeypair)
  const [casinoConfig] = findCasinoConfig()

  // Read current total_challenges to derive the challenge ID
  const config = await (program.account as any).casinoConfig.fetch(casinoConfig)
  const challengeId = (config as any).totalChallenges.toNumber()

  const [challengePda] = findChallenge(challengeId)
  const [vaultAuthorityPda] = findVault(challengeId)
  const vaultTokenAccount = Keypair.generate()
  const [creatorPlayerPda] = findPlayerAccount(creatorKeypair.publicKey)
  const creatorTokenAccount = await getAssociatedTokenAddress(USDC_MINT, creatorKeypair.publicKey)

  if (VRF_ENABLED) {
    // ── Production: Switchboard commit-reveal randomness ──
    // TX1: Create SB randomness account + commit (resolver pays so it can reveal later)
    const { rngKeypair, instructions: sbIxs } = await createAndCommitRandomness(
      resolverKeypair.publicKey,
    )
    const computeIx1 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 75_000 })
    const { blockhash: bh1 } = await connection.getLatestBlockhash('confirmed')
    const msg1 = new TransactionMessage({
      payerKey: resolverKeypair.publicKey,
      recentBlockhash: bh1,
      instructions: [computeIx1, ...sbIxs],
    }).compileToV0Message()
    const tx1 = new VersionedTransaction(msg1)
    tx1.sign([resolverKeypair, rngKeypair])
    const sig1 = await connection.sendTransaction(tx1)
    await connection.confirmTransaction(sig1, 'confirmed')

    // TX2: Create challenge referencing the committed randomness account
    const randomnessSeed = Array.from(rngKeypair.publicKey.toBytes())

    const txSig = await program.methods
      .createChallenge(amountUsdc, gameType, gameParams, randomnessSeed)
      .accounts({
        creator: creatorKeypair.publicKey,
        creatorPlayer: creatorPlayerPda,
        casinoConfig,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount: vaultTokenAccount.publicKey,
        creatorTokenAccount,
        usdcMint: USDC_MINT,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: rngKeypair.publicKey, isSigner: false, isWritable: false },
      ])
      .signers([creatorKeypair, vaultTokenAccount])
      .rpc()

    // Cache the vault token account and randomness account for later use
    vaultCache.set(challengeId, vaultTokenAccount.publicKey)
    rngCache.set(challengeId, rngKeypair.publicKey)

    return { txSig, challengeId }
  } else {
    // ── Test mode: deterministic randomness seed ──
    const randomnessSeed = Array.from(
      createHash('sha256').update(Buffer.from(`bot-challenge-${Date.now()}-${challengeId}`)).digest()
    )

    const txSig = await program.methods
      .createChallenge(amountUsdc, gameType, gameParams, randomnessSeed)
      .accounts({
        creator: creatorKeypair.publicKey,
        creatorPlayer: creatorPlayerPda,
        casinoConfig,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount: vaultTokenAccount.publicKey,
        creatorTokenAccount,
        usdcMint: USDC_MINT,
        systemProgram: SystemProgram.programId,
      })
      .signers([creatorKeypair, vaultTokenAccount])
      .rpc()

    vaultCache.set(challengeId, vaultTokenAccount.publicKey)
    return { txSig, challengeId }
  }
}

// ─── Accept Challenge ─────────────────────────────────────────────
export async function acceptChallenge(
  acceptorKeypair: Keypair,
  challengeId: number,
): Promise<string> {
  const program = getProgram(acceptorKeypair)
  const [challengePda] = findChallenge(challengeId)
  const [casinoConfig] = findCasinoConfig()
  const [acceptorPlayerPda] = findPlayerAccount(acceptorKeypair.publicKey)
  const acceptorTokenAccount = await getAssociatedTokenAddress(USDC_MINT, acceptorKeypair.publicKey)

  // Get vault token account — from cache or by discovering it
  const vaultTokenAccount = await getVaultTokenAccount(challengeId)

  return program.methods
    .acceptChallenge()
    .accounts({
      acceptor: acceptorKeypair.publicKey,
      acceptorPlayer: acceptorPlayerPda,
      challenge: challengePda,
      vaultTokenAccount,
      acceptorTokenAccount,
      casinoConfig,
      usdcMint: USDC_MINT,
    })
    .signers([acceptorKeypair])
    .rpc()
}

// ─── Resolve Game ─────────────────────────────────────────────────
export async function resolveGame(challengeId: number): Promise<string> {
  const program = getProgram(resolverKeypair)
  const [challengePda] = findChallenge(challengeId)

  // Fetch challenge to get creator and acceptor for player PDAs
  const challenge = await (program.account as any).challenge.fetch(challengePda)
  const [creatorPlayerPda] = findPlayerAccount((challenge as any).creator)
  const [acceptorPlayerPda] = findPlayerAccount((challenge as any).acceptor)

  if (VRF_ENABLED) {
    // ── Production: Switchboard reveal + resolve ──
    // Get the randomness account pubkey from the challenge's randomness_seed
    const randomnessSeedBytes = (challenge as any).randomnessSeed as number[]
    const rngPubkey = rngCache.get(challengeId)
      ?? new PublicKey(Uint8Array.from(randomnessSeedBytes))

    // Wait for at least 1 slot to elapse since commit
    await new Promise(resolve => setTimeout(resolve, 3000))

    const revealIx = await getRevealIx(rngPubkey)

    const resolveIx = await program.methods
      .resolveGame()
      .accounts({
        resolver: resolverKeypair.publicKey,
        challenge: challengePda,
        creatorPlayer: creatorPlayerPda,
        acceptorPlayer: acceptorPlayerPda,
      })
      .remainingAccounts([
        { pubkey: rngPubkey, isSigner: false, isWritable: false },
      ])
      .instruction()

    const computeIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 75_000 })
    const ixs = [computeIx, revealIx, resolveIx]

    const { blockhash } = await connection.getLatestBlockhash('confirmed')
    const messageV0 = new TransactionMessage({
      payerKey: resolverKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message()

    const tx = new VersionedTransaction(messageV0)
    tx.sign([resolverKeypair])

    const txSig = await connection.sendTransaction(tx)
    await connection.confirmTransaction(txSig, 'confirmed')

    // Clean up cache
    rngCache.delete(challengeId)

    return txSig
  } else {
    // ── Test mode: no VRF account needed ──
    return program.methods
      .resolveGame()
      .accounts({
        resolver: resolverKeypair.publicKey,
        challenge: challengePda,
        creatorPlayer: creatorPlayerPda,
        acceptorPlayer: acceptorPlayerPda,
      })
      .signers([resolverKeypair])
      .rpc()
  }
}

// ─── Claim Winnings ───────────────────────────────────────────────
export async function claimWinnings(
  winnerKeypair: Keypair,
  challengeId: number,
): Promise<{ txSig: string; payoutUsdc: string; rakeUsdc: string }> {
  const program = getProgram(winnerKeypair)
  const [challengePda] = findChallenge(challengeId)
  const [vaultAuthorityPda] = findVault(challengeId)
  const [casinoConfig] = findCasinoConfig()

  // Fetch challenge for outcome
  const challenge = await (program.account as any).challenge.fetch(challengePda)
  const outcome = Buffer.from((challenge as any).outcome as number[])
  const skillAnswer = computeSkillAnswer(outcome, challengeId)

  const vaultTokenAccount = await getVaultTokenAccount(challengeId)
  const winnerTokenAccount = await getAssociatedTokenAddress(USDC_MINT, winnerKeypair.publicKey)
  const revenueTokenAccount = await getAssociatedTokenAddress(USDC_MINT, REVENUE_WALLET)

  const txSig = await program.methods
    .claimWinnings(Array.from(skillAnswer) as any)
    .accounts({
      winner: winnerKeypair.publicKey,
      challenge: challengePda,
      vaultAuthority: vaultAuthorityPda,
      vaultTokenAccount,
      winnerTokenAccount,
      revenueTokenAccount,
      casinoConfig,
      usdcMint: USDC_MINT,
    })
    .signers([winnerKeypair])
    .rpc()

  // Calculate payout/rake
  const amountUsdc = (challenge as any).amountUsdc.toNumber()
  const pot = amountUsdc * 2
  const rake = Math.floor((pot * 250) / 10_000)
  const payout = pot - rake

  return {
    txSig,
    payoutUsdc: usdcDisplay(payout),
    rakeUsdc: usdcDisplay(rake),
  }
}

// ─── Fetch Helpers ────────────────────────────────────────────────

export async function fetchChallenge(challengeId: number) {
  const program = getProgram(resolverKeypair)
  const [challengePda] = findChallenge(challengeId)
  const data = await (program.account as any).challenge.fetch(challengePda)
  return {
    id: (data as any).id.toNumber(),
    creator: (data as any).creator as PublicKey,
    acceptor: (data as any).acceptor as PublicKey,
    amountUsdc: (data as any).amountUsdc.toNumber(),
    gameType: parseGameType((data as any).gameType),
    gameParams: (data as any).gameParams as number[],
    status: parseStatus((data as any).status),
    winner: (data as any).winner as PublicKey,
    outcome: (data as any).outcome as number[],
    skillAnswer: (data as any).skillAnswer as number[],
    createdAt: (data as any).createdAt.toNumber(),
    expiresAt: (data as any).expiresAt.toNumber(),
    resolvedAt: (data as any).resolvedAt.toNumber(),
    claimedAt: (data as any).claimedAt.toNumber(),
  }
}

export async function fetchOpenChallenges() {
  const program = getProgram(resolverKeypair)
  const all: any[] = await (program.account as any).challenge.all()
  return all
    .map((acc: any) => {
      const d = acc.account
      return {
        id: d.id.toNumber(),
        creator: d.creator as PublicKey,
        amountUsdc: d.amountUsdc.toNumber(),
        gameType: parseGameType(d.gameType),
        gameParams: d.gameParams as number[],
        status: parseStatus(d.status),
        expiresAt: d.expiresAt.toNumber(),
      }
    })
    .filter((c: any) => c.status === 'open')
}

export async function fetchPlayerAccount(wallet: PublicKey) {
  const program = getProgram(resolverKeypair)
  const [playerPda] = findPlayerAccount(wallet)
  try {
    const data = await (program.account as any).playerAccount.fetch(playerPda)
    return {
      wallet: (data as any).wallet as PublicKey,
      totalWagered: (data as any).totalWagered.toNumber(),
      betsPlaced: (data as any).betsPlaced,
      wins: (data as any).wins,
      losses: (data as any).losses,
      gamesPlayed: (data as any).gamesPlayed,
      registeredAt: (data as any).registeredAt.toNumber(),
    }
  } catch {
    return null
  }
}

export async function fetchPlayerChallenges(wallet: PublicKey) {
  const program = getProgram(resolverKeypair)
  const all: any[] = await (program.account as any).challenge.all()
  const walletStr = wallet.toBase58()
  return all
    .map((acc: any) => {
      const d = acc.account
      return {
        id: d.id.toNumber(),
        creator: d.creator as PublicKey,
        acceptor: d.acceptor as PublicKey,
        amountUsdc: d.amountUsdc.toNumber(),
        gameType: parseGameType(d.gameType),
        status: parseStatus(d.status),
        winner: d.winner as PublicKey,
        createdAt: d.createdAt.toNumber(),
      }
    })
    .filter(
      (c: any) =>
        c.creator.toBase58() === walletStr || c.acceptor.toBase58() === walletStr
    )
    .sort((a: any, b: any) => b.createdAt - a.createdAt)
}

// ─── Internal Helpers ─────────────────────────────────────────────

async function getVaultTokenAccount(challengeId: number): Promise<PublicKey> {
  // Check cache first
  const cached = vaultCache.get(challengeId)
  if (cached) return cached

  // Discover: find token accounts owned by vault authority PDA
  const [vaultAuthority] = findVault(challengeId)
  const accounts = await connection.getTokenAccountsByOwner(vaultAuthority, {
    mint: USDC_MINT,
  })
  if (accounts.value.length === 0) {
    throw new Error(`No vault token account found for challenge ${challengeId}`)
  }
  const pubkey = accounts.value[0].pubkey
  vaultCache.set(challengeId, pubkey)
  return pubkey
}
