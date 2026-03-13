import { Router, type Request, type Response } from 'express'
import {
  getChallengesByWallet,
  getStatsByWallet,
  getOpenChallenges,
  getChallengeById,
  getLeaderboard,
  getChallengeCount,
  getLastSyncSlot,
} from './db.js'

export const router = Router()

// GET /api/challenges?wallet=xxx
router.get('/challenges', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param required' })
  }
  const challenges = getChallengesByWallet(wallet)
  res.json({ challenges, total: challenges.length })
})

// GET /api/challenges/open
router.get('/challenges/open', (_req: Request, res: Response) => {
  const challenges = getOpenChallenges()
  res.json({ challenges })
})

// GET /api/challenges/:id
router.get('/challenges/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' })
  const challenge = getChallengeById(id)
  if (!challenge) return res.status(404).json({ error: 'not found' })
  res.json(challenge)
})

// GET /api/stats?wallet=xxx
router.get('/stats', (req: Request, res: Response) => {
  const wallet = req.query.wallet as string
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param required' })
  }
  const stats = getStatsByWallet(wallet)
  if (!stats) {
    return res.json({
      wallet,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      gamesPlayed: 0,
      winRate: 0,
      pnl: 0,
    })
  }

  const winRate = stats.games_played > 0
    ? (stats.wins / stats.games_played) * 100
    : 0

  res.json({
    wallet: stats.wallet,
    wins: stats.wins,
    losses: stats.losses,
    totalWagered: stats.total_wagered,
    betsPlaced: stats.bets_placed,
    gamesPlayed: stats.games_played,
    winRate: Math.round(winRate * 10) / 10,
    registeredAt: stats.registered_at,
    lastPlayedAt: stats.last_played_at,
  })
})

// GET /api/leaderboard?sortBy=wins|volume&limit=10
router.get('/leaderboard', (req: Request, res: Response) => {
  const sortBy = (req.query.sortBy as string) || 'wins'
  const limit = parseInt(req.query.limit as string) || 10
  const leaderboard = getLeaderboard(limit, sortBy)
  res.json({
    leaderboard: leaderboard.map((p, i) => ({
      rank: i + 1,
      wallet: p.wallet,
      wins: p.wins,
      losses: p.losses,
      totalWagered: p.total_wagered,
      gamesPlayed: p.games_played,
      winRate: p.games_played > 0 ? Math.round((p.wins / p.games_played) * 1000) / 10 : 0,
    })),
  })
})

// GET /api/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    lastSyncSlot: getLastSyncSlot(),
    challengeCount: getChallengeCount(),
    timestamp: Date.now(),
  })
})
