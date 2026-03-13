import { Keypair, PublicKey } from '@solana/web3.js'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { DATA_DIR, WALLET_ENCRYPTION_KEY } from '../config.js'
import type { StoredWallet } from '../types.js'

const WALLETS_DIR = path.join(DATA_DIR, 'wallets')
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  return Buffer.from(WALLET_ENCRYPTION_KEY, 'hex')
}

function encrypt(data: Uint8Array): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Pack: iv (12) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decrypt(packed: string): Uint8Array {
  const key = getEncryptionKey()
  const buf = Buffer.from(packed, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return new Uint8Array(decrypted)
}

function walletPath(telegramUserId: number): string {
  return path.join(WALLETS_DIR, `${telegramUserId}.json`)
}

function ensureDir(): void {
  if (!fs.existsSync(WALLETS_DIR)) {
    fs.mkdirSync(WALLETS_DIR, { recursive: true })
  }
}

export function walletExists(telegramUserId: number): boolean {
  return fs.existsSync(walletPath(telegramUserId))
}

export function getPublicKey(telegramUserId: number): PublicKey | null {
  const fp = walletPath(telegramUserId)
  if (!fs.existsSync(fp)) return null
  const stored: StoredWallet = JSON.parse(fs.readFileSync(fp, 'utf-8'))
  return new PublicKey(stored.publicKey)
}

export function getWallet(telegramUserId: number): Keypair | null {
  const fp = walletPath(telegramUserId)
  if (!fs.existsSync(fp)) return null
  const stored: StoredWallet = JSON.parse(fs.readFileSync(fp, 'utf-8'))
  const secretKey = decrypt(stored.encryptedSecretKey)
  return Keypair.fromSecretKey(secretKey)
}

export function getOrCreateWallet(telegramUserId: number): { keypair: Keypair; isNew: boolean } {
  const existing = getWallet(telegramUserId)
  if (existing) return { keypair: existing, isNew: false }

  ensureDir()
  const keypair = Keypair.generate()
  const stored: StoredWallet = {
    telegramUserId,
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecretKey: encrypt(keypair.secretKey),
    createdAt: new Date().toISOString(),
  }
  fs.writeFileSync(walletPath(telegramUserId), JSON.stringify(stored, null, 2))
  return { keypair, isNew: true }
}
