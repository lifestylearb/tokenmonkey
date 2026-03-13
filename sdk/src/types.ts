import { PublicKey } from '@solana/web3.js'

/** Supported game types */
export type GameType = 'coinflip' | 'dice'

/** Coinflip pick */
export type CoinflipPick = 'heads' | 'tails'

/** Dice direction */
export type DiceDirection = 'over' | 'under'

/** Challenge status */
export type ChallengeStatus = 'open' | 'matched' | 'resolved' | 'claimed' | 'cancelled' | 'expired'

/** Parsed challenge data */
export interface Challenge {
  id: number
  creator: PublicKey
  acceptor: PublicKey
  amountUsdc: number
  gameType: GameType
  gameParams: number[]
  status: ChallengeStatus
  winner: PublicKey
  createdAt: number
  expiresAt: number
  resolvedAt: number
  claimedAt: number
}

/** Parsed player account data */
export interface PlayerAccount {
  wallet: PublicKey
  totalWagered: number
  betsPlaced: number
  wins: number
  losses: number
  gamesPlayed: number
  registeredAt: number
  lastPlayedAt: number
}

/** Result of creating a challenge */
export interface CreateChallengeResult {
  txSignature: string
  challengeId: number
}

/** Result of claiming winnings */
export interface ClaimResult {
  txSignature: string
  payoutUsdc: number
  rakeUsdc: number
}

/** Game result after resolution and claim */
export interface GameResult {
  challengeId: number
  gameType: GameType
  amountUsdc: number
  winner: PublicKey
  loser: PublicKey
  payoutUsdc: number
  rakeUsdc: number
}

/** SDK configuration */
export interface TokenMonkeyConfig {
  /** Solana RPC URL */
  rpcUrl?: string
  /** USDC mint address (defaults to devnet test mint) */
  usdcMint?: PublicKey
  /** Commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized'
}
