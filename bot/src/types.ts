import { PublicKey } from '@solana/web3.js'

export interface StoredWallet {
  telegramUserId: number
  publicKey: string // base58
  encryptedSecretKey: string // base64(iv + ciphertext + authTag)
  createdAt: string // ISO 8601
}

export interface ChallengeData {
  id: number
  creator: PublicKey
  acceptor: PublicKey
  amountUsdc: number // raw lamports (6 decimals)
  gameType: 'coinflip' | 'dice'
  gameParams: number[]
  status: 'open' | 'matched' | 'resolved' | 'claimed' | 'cancelled' | 'expired'
  winner: PublicKey
  outcome: number[]
  skillAnswer: number[]
  createdAt: number
  expiresAt: number
  resolvedAt: number
  claimedAt: number
}

export interface VaultInfo {
  challengeId: number
  vaultTokenAccount: PublicKey
}
