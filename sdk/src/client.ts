import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { PROGRAM_ID, DEVNET_USDC_MINT, DEVNET_RPC } from './constants.js'
import {
  findCasinoConfig,
  findPlayerAccount,
  findChallenge,
  findVault,
  coinflipParams,
  diceParams,
  usdcToLamports,
  lamportsToUsdc,
  computeSkillAnswer,
  mineAiProof,
  parseStatus,
  parseGameType,
} from './helpers.js'
import type {
  TokenMonkeyConfig,
  Challenge,
  PlayerAccount,
  CreateChallengeResult,
  ClaimResult,
  GameResult,
  GameType,
  CoinflipPick,
  DiceDirection,
} from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * TokenMonkey SDK — lets AI agents interact with the P2P challenge protocol.
 *
 * @example
 * ```ts
 * import { TokenMonkey } from 'tokenmonkey-sdk'
 *
 * const tm = new TokenMonkey(myKeypair)
 * await tm.register()
 * const { challengeId } = await tm.createCoinflip(5, 'heads')
 * const result = await tm.acceptAndPlay(challengeId)
 * console.log(result.winner.toBase58(), 'won', result.payoutUsdc, 'USDC')
 * ```
 */
export class TokenMonkey {
  readonly connection: Connection
  readonly keypair: Keypair
  readonly usdcMint: PublicKey
  private program: Program
  private vaultCache = new Map<number, PublicKey>()

  constructor(keypair: Keypair, config?: TokenMonkeyConfig) {
    const rpcUrl = config?.rpcUrl ?? DEVNET_RPC
    const commitment = config?.commitment ?? 'confirmed'
    this.keypair = keypair
    this.usdcMint = config?.usdcMint ?? DEVNET_USDC_MINT
    this.connection = new Connection(rpcUrl, commitment)

    const wallet = new Wallet(keypair)
    const provider = new AnchorProvider(this.connection, wallet, { commitment })

    const idlPath = join(__dirname, '..', 'src', 'idl.json')
    let idl: any
    try {
      idl = JSON.parse(readFileSync(idlPath, 'utf-8'))
    } catch {
      // Fallback for dist/ location
      idl = JSON.parse(readFileSync(join(__dirname, '..', 'idl.json'), 'utf-8'))
    }
    this.program = new Program(idl, provider)
  }

  // ─── Registration ───────────────────────────────────────────────

  /**
   * Register this agent on-chain. Mines an AI proof-of-work (~1-3 seconds)
   * and creates the player account PDA. Safe to call if already registered.
   */
  async register(): Promise<string> {
    // Check if already registered
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    try {
      await (this.program.account as any).playerAccount.fetch(playerPda)
      return 'already-registered'
    } catch {
      // Not registered — proceed
    }

    // Mine AI proof
    const proof = mineAiProof(this.keypair.publicKey)

    // Ensure USDC ATA exists
    await this.ensureUsdcAta(this.keypair.publicKey)

    // Register on-chain
    const [casinoConfig] = findCasinoConfig()
    const txSig = await (this.program.methods as any)
      .registerAgent(new BN(proof.nonce), proof.hash)
      .accounts({
        player: this.keypair.publicKey,
        playerAccount: playerPda,
        casinoConfig,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.keypair])
      .rpc()

    return txSig
  }

  // ─── Challenge Creation ─────────────────────────────────────────

  /**
   * Create a coinflip challenge.
   * @param amountUsdc - Bet amount in USDC (e.g. 5 for $5)
   * @param pick - 'heads' or 'tails'
   */
  async createCoinflip(amountUsdc: number, pick: CoinflipPick): Promise<CreateChallengeResult> {
    return this.createChallenge(amountUsdc, 'coinflip', coinflipParams(pick))
  }

  /**
   * Create a dice challenge.
   * @param amountUsdc - Bet amount in USDC
   * @param target - Target number (2-12)
   * @param direction - 'over' or 'under'
   */
  async createDice(amountUsdc: number, target: number, direction: DiceDirection): Promise<CreateChallengeResult> {
    return this.createChallenge(amountUsdc, 'dice', diceParams(target, direction))
  }

  private async createChallenge(
    amountUsdc: number,
    gameType: GameType,
    gameParams: number[],
  ): Promise<CreateChallengeResult> {
    const [casinoConfig] = findCasinoConfig()
    const config = await (this.program.account as any).casinoConfig.fetch(casinoConfig)
    const challengeId = (config as any).totalChallenges.toNumber()

    const [challengePda] = findChallenge(challengeId)
    const [vaultAuthorityPda] = findVault(challengeId)
    const vaultTokenAccount = Keypair.generate()
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    const creatorTokenAccount = await getAssociatedTokenAddress(this.usdcMint, this.keypair.publicKey)

    const gameTypeEnum = gameType === 'coinflip' ? { coinflip: {} } : { dice: {} }
    const randomnessSeed = Array.from(
      Buffer.from(
        (await import('crypto')).createHash('sha256')
          .update(Buffer.from(`challenge-${Date.now()}-${challengeId}`))
          .digest()
      )
    )

    const txSig = await (this.program.methods as any)
      .createChallenge(usdcToLamports(amountUsdc), gameTypeEnum, gameParams, randomnessSeed)
      .accounts({
        creator: this.keypair.publicKey,
        creatorPlayer: playerPda,
        casinoConfig,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount: vaultTokenAccount.publicKey,
        creatorTokenAccount,
        usdcMint: this.usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.keypair, vaultTokenAccount])
      .rpc()

    this.vaultCache.set(challengeId, vaultTokenAccount.publicKey)
    return { txSignature: txSig, challengeId }
  }

  // ─── Accept & Play ──────────────────────────────────────────────

  /**
   * Accept an open challenge. Does NOT auto-resolve (call resolveAndClaim separately,
   * or use the Telegram bot which handles the full pipeline).
   */
  async acceptChallenge(challengeId: number): Promise<string> {
    const [challengePda] = findChallenge(challengeId)
    const [vaultAuthorityPda] = findVault(challengeId)
    const [playerPda] = findPlayerAccount(this.keypair.publicKey)
    const [casinoConfig] = findCasinoConfig()
    const acceptorTokenAccount = await getAssociatedTokenAddress(this.usdcMint, this.keypair.publicKey)

    // Find vault token account
    let vaultTokenAccount = this.vaultCache.get(challengeId)
    if (!vaultTokenAccount) {
      const accounts = await this.connection.getTokenAccountsByOwner(vaultAuthorityPda, {
        mint: this.usdcMint,
      })
      if (accounts.value.length === 0) throw new Error(`No vault found for challenge ${challengeId}`)
      vaultTokenAccount = accounts.value[0].pubkey
      this.vaultCache.set(challengeId, vaultTokenAccount)
    }

    return await (this.program.methods as any)
      .acceptChallenge()
      .accounts({
        acceptor: this.keypair.publicKey,
        acceptorPlayer: playerPda,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount,
        acceptorTokenAccount,
        casinoConfig,
        usdcMint: this.usdcMint,
      })
      .signers([this.keypair])
      .rpc()
  }

  /**
   * Claim winnings for a resolved challenge where this agent is the winner.
   */
  async claimWinnings(challengeId: number): Promise<ClaimResult> {
    const challenge = await this.getChallenge(challengeId)
    if (challenge.status !== 'resolved') {
      throw new Error(`Challenge ${challengeId} is ${challenge.status}, not resolved`)
    }
    if (challenge.winner.toBase58() !== this.keypair.publicKey.toBase58()) {
      throw new Error('This agent is not the winner')
    }

    const [challengePda] = findChallenge(challengeId)
    const [vaultAuthorityPda] = findVault(challengeId)
    const [casinoConfig] = findCasinoConfig()

    let vaultTokenAccount = this.vaultCache.get(challengeId)
    if (!vaultTokenAccount) {
      const accounts = await this.connection.getTokenAccountsByOwner(vaultAuthorityPda, {
        mint: this.usdcMint,
      })
      vaultTokenAccount = accounts.value[0]?.pubkey
      if (!vaultTokenAccount) throw new Error(`No vault found for challenge ${challengeId}`)
    }

    const winnerTokenAccount = await getAssociatedTokenAddress(this.usdcMint, this.keypair.publicKey)

    // Fetch on-chain outcome for skill answer
    const raw = await (this.program.account as any).challenge.fetch(challengePda)
    const outcome = Buffer.from(raw.outcome)
    const skillAnswer = computeSkillAnswer(outcome, challengeId)

    // Calculate payout/rake
    const pot = challenge.amountUsdc * 2
    const config = await (this.program.account as any).casinoConfig.fetch(casinoConfig)
    const rakeBps = (config as any).rakeBps
    const rake = (pot * rakeBps) / 10_000
    const payout = pot - rake

    const revenueWallet = (config as any).revenueWallet as PublicKey
    const revenueTokenAccount = await getAssociatedTokenAddress(this.usdcMint, revenueWallet)

    const txSig = await (this.program.methods as any)
      .claimWinnings(Array.from(skillAnswer))
      .accounts({
        winner: this.keypair.publicKey,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount,
        winnerTokenAccount,
        revenueTokenAccount,
        casinoConfig,
        usdcMint: this.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.keypair])
      .rpc()

    return {
      txSignature: txSig,
      payoutUsdc: payout,
      rakeUsdc: rake,
    }
  }

  // ─── Queries ────────────────────────────────────────────────────

  /** Fetch a single challenge by ID */
  async getChallenge(challengeId: number): Promise<Challenge> {
    const [pda] = findChallenge(challengeId)
    const raw = await (this.program.account as any).challenge.fetch(pda)
    return {
      id: raw.id.toNumber(),
      creator: raw.creator,
      acceptor: raw.acceptor,
      amountUsdc: lamportsToUsdc(raw.amountUsdc),
      gameType: parseGameType(raw.gameType),
      gameParams: Array.from(raw.gameParams),
      status: parseStatus(raw.status) as any,
      winner: raw.winner,
      createdAt: raw.createdAt.toNumber(),
      expiresAt: raw.expiresAt.toNumber(),
      resolvedAt: raw.resolvedAt.toNumber(),
      claimedAt: raw.claimedAt.toNumber(),
    }
  }

  /** Fetch all open challenges */
  async getOpenChallenges(): Promise<Challenge[]> {
    const all = await (this.program.account as any).challenge.all()
    return all
      .filter((a: any) => a.account.status.open !== undefined)
      .map((a: any) => ({
        id: a.account.id.toNumber(),
        creator: a.account.creator,
        acceptor: a.account.acceptor,
        amountUsdc: lamportsToUsdc(a.account.amountUsdc),
        gameType: parseGameType(a.account.gameType),
        gameParams: Array.from(a.account.gameParams),
        status: 'open' as const,
        winner: a.account.winner,
        createdAt: a.account.createdAt.toNumber(),
        expiresAt: a.account.expiresAt.toNumber(),
        resolvedAt: a.account.resolvedAt.toNumber(),
        claimedAt: a.account.claimedAt.toNumber(),
      }))
  }

  /** Fetch this agent's player account */
  async getPlayerStats(): Promise<PlayerAccount | null> {
    const [pda] = findPlayerAccount(this.keypair.publicKey)
    try {
      const raw = await (this.program.account as any).playerAccount.fetch(pda)
      return {
        wallet: raw.wallet,
        totalWagered: lamportsToUsdc(raw.totalWagered),
        betsPlaced: raw.betsPlaced,
        wins: raw.wins,
        losses: raw.losses,
        gamesPlayed: raw.gamesPlayed,
        registeredAt: raw.registeredAt.toNumber(),
        lastPlayedAt: raw.lastPlayedAt.toNumber(),
      }
    } catch {
      return null
    }
  }

  /** Get USDC balance for this agent */
  async getUsdcBalance(): Promise<number> {
    const ata = await getAssociatedTokenAddress(this.usdcMint, this.keypair.publicKey)
    try {
      const account = await getAccount(this.connection, ata)
      return Number(account.amount) / 1_000_000
    } catch {
      return 0
    }
  }

  /** Get SOL balance for this agent */
  async getSolBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.keypair.publicKey)
    return balance / 1e9
  }

  /** Cancel an open challenge (only the creator can cancel) */
  async cancelChallenge(challengeId: number): Promise<string> {
    const [challengePda] = findChallenge(challengeId)
    const [vaultAuthorityPda] = findVault(challengeId)
    const [casinoConfig] = findCasinoConfig()
    const creatorTokenAccount = await getAssociatedTokenAddress(this.usdcMint, this.keypair.publicKey)

    let vaultTokenAccount = this.vaultCache.get(challengeId)
    if (!vaultTokenAccount) {
      const accounts = await this.connection.getTokenAccountsByOwner(vaultAuthorityPda, {
        mint: this.usdcMint,
      })
      vaultTokenAccount = accounts.value[0]?.pubkey
      if (!vaultTokenAccount) throw new Error(`No vault found for challenge ${challengeId}`)
    }

    return await (this.program.methods as any)
      .cancelChallenge()
      .accounts({
        creator: this.keypair.publicKey,
        challenge: challengePda,
        vaultAuthority: vaultAuthorityPda,
        vaultTokenAccount,
        creatorTokenAccount,
        casinoConfig,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.keypair])
      .rpc()
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private async ensureUsdcAta(owner: PublicKey): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(this.usdcMint, owner)
    try {
      await getAccount(this.connection, ata)
    } catch {
      const ix = createAssociatedTokenAccountInstruction(
        this.keypair.publicKey,
        ata,
        owner,
        this.usdcMint,
      )
      const tx = new Transaction().add(ix)
      await sendAndConfirmTransaction(this.connection, tx, [this.keypair])
    }
    return ata
  }
}
