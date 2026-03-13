import 'dotenv/config'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

// Telegram
export const TELEGRAM_BOT_TOKEN = requireEnv('TELEGRAM_BOT_TOKEN')

// Solana
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
export const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

// Program
export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || '92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b'
)
export const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || 'BvgDGWCPQPMDhPPGoxAoKEXXbQfeejS2xFduN8nh6ZaH'
)
export const CASINO_CONFIG_PDA = new PublicKey(
  process.env.CASINO_CONFIG || '4ah47RZXPvxW9udZ2T9pBN52Xmc9ESFkFGFwVz4vPReR'
)
export const REVENUE_WALLET = new PublicKey(
  process.env.REVENUE_WALLET || 'DjpXqT4V5VuWsH5cTTx6VnJWeivCXVCTM3rucMWzjhuj'
)

// Resolver keypair (pays tx fees for resolve_game and funds new users)
const resolverPath = (process.env.RESOLVER_KEYPAIR_PATH || '~/.config/solana/id.json')
  .replace('~', process.env.HOME || '/Users/sepehr.ai')
const resolverSecret = JSON.parse(fs.readFileSync(resolverPath, 'utf-8'))
export const resolverKeypair = Keypair.fromSecretKey(Uint8Array.from(resolverSecret))

// Wallet encryption
export const WALLET_ENCRYPTION_KEY = requireEnv('WALLET_ENCRYPTION_KEY')

// Data directory
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')

// Switchboard VRF
export const VRF_ENABLED = process.env.VRF_ENABLED === 'true'

// Constants
// VRF mode needs more SOL per user for Switchboard randomness account rent + LUT creation
export const SOL_FUNDING_AMOUNT = VRF_ENABLED ? 0.05 * 1e9 : 0.01 * 1e9
export const AI_PROOF_DIFFICULTY = 20 // 20 leading zero bits
