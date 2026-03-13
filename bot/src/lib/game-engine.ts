import { Keypair, PublicKey } from '@solana/web3.js'
import {
  resolveGame,
  claimWinnings,
  fetchChallenge,
} from './program.js'
import { getWallet } from './wallet-store.js'
import { usdcDisplay } from './anchor-helpers.js'

// Map of wallet pubkey -> telegram user ID (for notifications)
const walletToUser = new Map<string, number>()

export function registerWalletMapping(pubkey: PublicKey, telegramUserId: number) {
  walletToUser.set(pubkey.toBase58(), telegramUserId)
}

export function getTelegramUserId(pubkey: PublicKey): number | undefined {
  return walletToUser.get(pubkey.toBase58())
}

export interface GameResult {
  challengeId: number
  gameType: 'coinflip' | 'dice'
  amountUsdc: number
  winner: PublicKey
  loser: PublicKey
  payoutUsdc: string
  rakeUsdc: string
  winnerId?: number // telegram user id
  loserId?: number // telegram user id
}

/**
 * Auto-resolve pipeline: resolve game → determine winner → claim winnings → return result
 *
 * Called after accept_challenge succeeds.
 */
export async function autoResolveAndClaim(
  challengeId: number,
): Promise<GameResult> {
  // Step 1: Resolve the game (permissionless — resolver keypair cranks it)
  await resolveGame(challengeId)

  // Step 2: Fetch resolved challenge to determine winner
  const challenge = await fetchChallenge(challengeId)
  const winner = challenge.winner
  const creator = challenge.creator
  const acceptor = challenge.acceptor
  const loser = winner.toBase58() === creator.toBase58() ? acceptor : creator

  // Step 3: Claim winnings (need the winner's keypair)
  const winnerId = getTelegramUserId(winner)
  let payoutUsdc = '0.00'
  let rakeUsdc = '0.00'

  if (winnerId) {
    const winnerKeypair = getWallet(winnerId)
    if (winnerKeypair) {
      const result = await claimWinnings(winnerKeypair, challengeId)
      payoutUsdc = result.payoutUsdc
      rakeUsdc = result.rakeUsdc
    }
  }

  return {
    challengeId,
    gameType: challenge.gameType,
    amountUsdc: challenge.amountUsdc,
    winner,
    loser,
    payoutUsdc,
    rakeUsdc,
    winnerId: getTelegramUserId(winner),
    loserId: getTelegramUserId(loser),
  }
}
