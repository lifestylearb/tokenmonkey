import { Connection, PublicKey } from '@solana/web3.js'
import { upsertChallenge, upsertPlayer, setLastSyncSlot, type ChallengeRow, type PlayerRow } from './db.js'

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000')

const connection = new Connection(RPC_URL, 'confirmed')

const STATUS_MAP: Record<number, string> = {
  0: 'open', 1: 'matched', 2: 'resolved',
  3: 'claimed', 4: 'cancelled', 5: 'expired'
}

const GAME_TYPE_MAP: Record<number, string> = {
  0: 'Coinflip', 1: 'Dice'
}

const DEFAULT_PUBKEY = '11111111111111111111111111111111'

function parseChallenge(data: Buffer, pda: string): ChallengeRow | null {
  try {
    const d = 8 // skip discriminator
    const id = Number(data.readBigUInt64LE(d))
    const creator = new PublicKey(data.subarray(d + 8, d + 40)).toBase58()
    const acceptor = new PublicKey(data.subarray(d + 40, d + 72)).toBase58()
    const amountUsdc = Number(data.readBigUInt64LE(d + 72)) / 1e6
    const gameTypeByte = data[d + 80]
    // game_params: 32 bytes at d+81
    const statusByte = data[d + 80 + 1 + 32] // game_type(1) + game_params(32)

    const gameType = GAME_TYPE_MAP[gameTypeByte] || 'Unknown'
    const status = STATUS_MAP[statusByte] || 'unknown'

    // vault_bump: 1 byte
    // randomness_seed: 32 bytes
    // outcome: 32 bytes
    const winnerOffset = d + 80 + 1 + 32 + 1 + 1 + 32 + 32
    const winner = new PublicKey(data.subarray(winnerOffset, winnerOffset + 32)).toBase58()

    // skill_answer: 32 bytes after winner
    const tsOffset = winnerOffset + 32 + 32
    const createdAt = Number(data.readBigInt64LE(tsOffset))
    const expiresAt = Number(data.readBigInt64LE(tsOffset + 8))
    const resolvedAt = Number(data.readBigInt64LE(tsOffset + 16))
    const claimedAt = Number(data.readBigInt64LE(tsOffset + 24))

    return {
      id,
      creator,
      acceptor: acceptor === DEFAULT_PUBKEY ? null : acceptor,
      amount_usdc: amountUsdc,
      game_type: gameType,
      status,
      winner: winner === DEFAULT_PUBKEY ? null : winner,
      created_at: createdAt,
      expires_at: expiresAt,
      resolved_at: resolvedAt || null,
      claimed_at: claimedAt || null,
      pda,
    }
  } catch (err) {
    return null
  }
}

function parsePlayer(data: Buffer): PlayerRow | null {
  try {
    const d = 8 // skip discriminator
    const wallet = new PublicKey(data.subarray(d, d + 32)).toBase58()
    const totalWagered = Number(data.readBigUInt64LE(d + 32)) / 1e6
    const betsPlaced = data.readUInt32LE(d + 40)
    const wins = data.readUInt32LE(d + 44)
    const losses = data.readUInt32LE(d + 48)
    const gamesPlayed = data.readUInt32LE(d + 52)
    // referral_code: 8 bytes
    // referred_by: 32 bytes
    // referral_count: 2 bytes
    const tsOffset = d + 56 + 8 + 32 + 2
    const registeredAt = Number(data.readBigInt64LE(tsOffset))
    const lastPlayedAt = Number(data.readBigInt64LE(tsOffset + 8))

    return {
      wallet,
      total_wagered: totalWagered,
      bets_placed: betsPlaced,
      wins,
      losses,
      games_played: gamesPlayed,
      registered_at: registeredAt || null,
      last_played_at: lastPlayedAt || null,
    }
  } catch (err) {
    return null
  }
}

async function syncAll() {
  try {
    console.log('Starting full sync...')
    const slot = await connection.getSlot()

    // Fetch all program accounts
    const accounts = await connection.getProgramAccounts(PROGRAM_ID)
    console.log(`Found ${accounts.length} program accounts`)

    let challengeCount = 0
    let playerCount = 0

    for (const { pubkey, account } of accounts) {
      const data = account.data

      // Try to parse as challenge (larger accounts)
      if (data.length > 200) {
        const challenge = parseChallenge(data, pubkey.toBase58())
        if (challenge && challenge.id > 0) {
          upsertChallenge(challenge)
          challengeCount++
          continue
        }
      }

      // Try to parse as player (smaller accounts)
      if (data.length > 100 && data.length < 250) {
        const player = parsePlayer(data)
        if (player) {
          upsertPlayer(player)
          playerCount++
        }
      }
    }

    setLastSyncSlot(slot)
    console.log(`Synced ${challengeCount} challenges, ${playerCount} players at slot ${slot}`)
  } catch (err) {
    console.error('Sync error:', err)
  }
}

export function startIndexer() {
  // Initial full sync
  syncAll()

  // Poll for updates
  setInterval(syncAll, POLL_INTERVAL)

  console.log(`Indexer started — polling every ${POLL_INTERVAL / 1000}s`)
}
