import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'tokenmonkey.db')

let db: Database.Database

export function initDb() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY,
      creator TEXT NOT NULL,
      acceptor TEXT,
      amount_usdc REAL NOT NULL,
      game_type TEXT NOT NULL,
      status TEXT NOT NULL,
      winner TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      resolved_at INTEGER,
      claimed_at INTEGER,
      pda TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_challenges_creator ON challenges(creator);
    CREATE INDEX IF NOT EXISTS idx_challenges_acceptor ON challenges(acceptor);
    CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

    CREATE TABLE IF NOT EXISTS players (
      wallet TEXT PRIMARY KEY,
      total_wagered REAL DEFAULT 0,
      bets_placed INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      registered_at INTEGER,
      last_played_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  console.log('Database initialized at', DB_PATH)
  return db
}

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export interface ChallengeRow {
  id: number
  creator: string
  acceptor: string | null
  amount_usdc: number
  game_type: string
  status: string
  winner: string | null
  created_at: number
  expires_at: number | null
  resolved_at: number | null
  claimed_at: number | null
  pda: string
}

export interface PlayerRow {
  wallet: string
  total_wagered: number
  bets_placed: number
  wins: number
  losses: number
  games_played: number
  registered_at: number | null
  last_played_at: number | null
}

export function upsertChallenge(c: ChallengeRow) {
  const stmt = getDb().prepare(`
    INSERT INTO challenges (id, creator, acceptor, amount_usdc, game_type, status, winner, created_at, expires_at, resolved_at, claimed_at, pda, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      acceptor = excluded.acceptor,
      status = excluded.status,
      winner = excluded.winner,
      resolved_at = excluded.resolved_at,
      claimed_at = excluded.claimed_at,
      updated_at = unixepoch()
  `)
  stmt.run(c.id, c.creator, c.acceptor, c.amount_usdc, c.game_type, c.status, c.winner, c.created_at, c.expires_at, c.resolved_at, c.claimed_at, c.pda)
}

export function upsertPlayer(p: PlayerRow) {
  const stmt = getDb().prepare(`
    INSERT INTO players (wallet, total_wagered, bets_placed, wins, losses, games_played, registered_at, last_played_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(wallet) DO UPDATE SET
      total_wagered = excluded.total_wagered,
      bets_placed = excluded.bets_placed,
      wins = excluded.wins,
      losses = excluded.losses,
      games_played = excluded.games_played,
      last_played_at = excluded.last_played_at,
      updated_at = unixepoch()
  `)
  stmt.run(p.wallet, p.total_wagered, p.bets_placed, p.wins, p.losses, p.games_played, p.registered_at, p.last_played_at)
}

export function getChallengesByWallet(wallet: string): ChallengeRow[] {
  return getDb().prepare(`
    SELECT * FROM challenges WHERE creator = ? OR acceptor = ? ORDER BY created_at DESC
  `).all(wallet, wallet) as ChallengeRow[]
}

export function getStatsByWallet(wallet: string): PlayerRow | undefined {
  return getDb().prepare(`SELECT * FROM players WHERE wallet = ?`).get(wallet) as PlayerRow | undefined
}

export function getOpenChallenges(): ChallengeRow[] {
  return getDb().prepare(`SELECT * FROM challenges WHERE status = 'open' ORDER BY created_at DESC`).all() as ChallengeRow[]
}

export function getChallengeById(id: number): ChallengeRow | undefined {
  return getDb().prepare(`SELECT * FROM challenges WHERE id = ?`).get(id) as ChallengeRow | undefined
}

export function getLeaderboard(limit = 10, sortBy = 'wins'): PlayerRow[] {
  const col = sortBy === 'volume' ? 'total_wagered' : 'wins'
  return getDb().prepare(`SELECT * FROM players ORDER BY ${col} DESC LIMIT ?`).all(limit) as PlayerRow[]
}

export function getLastSyncSlot(): number {
  const row = getDb().prepare(`SELECT value FROM sync_state WHERE key = 'last_slot'`).get() as { value: string } | undefined
  return row ? parseInt(row.value) : 0
}

export function setLastSyncSlot(slot: number) {
  getDb().prepare(`INSERT INTO sync_state (key, value) VALUES ('last_slot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(slot))
}

export function getChallengeCount(): number {
  const row = getDb().prepare(`SELECT COUNT(*) as count FROM challenges`).get() as { count: number }
  return row.count
}

export interface PlatformStats {
  totalPlayers: number
  totalChallenges: number
  totalVolume: number
  openChallenges: number
  resolvedChallenges: number
  totalGamesPlayed: number
  signupsByDay: { date: string; count: number }[]
  recentPlayers: { wallet: string; registered_at: number }[]
}

export function getPlatformStats(): PlatformStats {
  const d = getDb()

  const players = d.prepare(`SELECT COUNT(*) as count FROM players`).get() as { count: number }
  const challenges = d.prepare(`SELECT COUNT(*) as count FROM challenges`).get() as { count: number }
  const volume = d.prepare(`SELECT COALESCE(SUM(amount_usdc), 0) as total FROM challenges WHERE status IN ('resolved', 'claimed')`).get() as { total: number }
  const open = d.prepare(`SELECT COUNT(*) as count FROM challenges WHERE status = 'open'`).get() as { count: number }
  const resolved = d.prepare(`SELECT COUNT(*) as count FROM challenges WHERE status IN ('resolved', 'claimed')`).get() as { count: number }
  const gamesPlayed = d.prepare(`SELECT COALESCE(SUM(games_played), 0) as total FROM players`).get() as { total: number }

  const signupsByDay = d.prepare(`
    SELECT date(registered_at, 'unixepoch') as date, COUNT(*) as count
    FROM players
    WHERE registered_at IS NOT NULL
    GROUP BY date(registered_at, 'unixepoch')
    ORDER BY date DESC
    LIMIT 30
  `).all() as { date: string; count: number }[]

  const recentPlayers = d.prepare(`
    SELECT wallet, registered_at FROM players
    WHERE registered_at IS NOT NULL
    ORDER BY registered_at DESC
    LIMIT 10
  `).all() as { wallet: string; registered_at: number }[]

  return {
    totalPlayers: players.count,
    totalChallenges: challenges.count,
    totalVolume: volume.total,
    openChallenges: open.count,
    resolvedChallenges: resolved.count,
    totalGamesPlayed: gamesPlayed.total,
    signupsByDay: signupsByDay.reverse(),
    recentPlayers,
  }
}
