import { useState, useEffect, useCallback } from 'react'
import { useGame } from '../store'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'

const RPC_URL = 'https://api.devnet.solana.com'
const USDC_MINT = new PublicKey('BvgDGWMqsBEwgnbtGFzqJPhXTTJfMumjJBRCsYuJnGJR')
const PROGRAM_ID = new PublicKey('92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b')
const INDEXER_URL = (import.meta as any).env?.VITE_INDEXER_URL || ''

interface PlayerStats {
  wallet: string
  totalWagered: number
  betsPlaced: number
  wins: number
  losses: number
  gamesPlayed: number
  registeredAt: number
  lastPlayedAt: number
}

interface Challenge {
  id: number
  creator: string
  acceptor: string
  amountUsdc: number
  gameType: string
  status: string
  winner: string
  createdAt: number
  resolvedAt: number
}

export default function Dashboard() {
  const { state } = useGame()
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [activeChallenges, setActiveChallenges] = useState<Challenge[]>([])
  const [history, setHistory] = useState<Challenge[]>([])
  const [usdcBalance, setUsdcBalance] = useState(0)
  const [solBalance, setSolBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const wallet = state.address || ''

  const fetchData = useCallback(async () => {
    if (!wallet) return
    setLoading(true)
    setError(null)

    try {
      const connection = new Connection(RPC_URL, 'confirmed')
      const walletPk = new PublicKey(wallet)

      // Fetch balances
      const [solBal, usdcAta] = await Promise.all([
        connection.getBalance(walletPk),
        getAssociatedTokenAddress(USDC_MINT, walletPk),
      ])
      setSolBalance(solBal / 1e9)

      try {
        const tokenBal = await connection.getTokenAccountBalance(usdcAta)
        setUsdcBalance(Number(tokenBal.value.uiAmount || 0))
      } catch {
        setUsdcBalance(0)
      }

      // Try indexer first
      if (INDEXER_URL) {
        try {
          const [statsRes, challengesRes] = await Promise.all([
            fetch(`${INDEXER_URL}/api/stats?wallet=${wallet}`),
            fetch(`${INDEXER_URL}/api/challenges?wallet=${wallet}`),
          ])
          if (statsRes.ok && challengesRes.ok) {
            const statsData = await statsRes.json()
            const challengesData = await challengesRes.json()
            setStats(statsData)
            setActiveChallenges(challengesData.challenges?.filter((c: Challenge) =>
              c.status === 'open' || c.status === 'matched'
            ) || [])
            setHistory(challengesData.challenges?.filter((c: Challenge) =>
              c.status === 'resolved' || c.status === 'claimed' || c.status === 'cancelled'
            ) || [])
            setLoading(false)
            return
          }
        } catch {
          // Fall through to RPC
        }
      }

      // Fallback: direct RPC queries
      // Fetch player stats PDA
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('player'), walletPk.toBuffer()],
        PROGRAM_ID
      )
      try {
        const accountInfo = await connection.getAccountInfo(playerPda)
        if (accountInfo) {
          // Parse player account (simplified — matches on-chain layout)
          const data = accountInfo.data
          // Skip discriminator (8 bytes) + wallet (32 bytes)
          const offset = 8 + 32
          const totalWagered = Number(data.readBigUInt64LE(offset)) / 1e6
          const betsPlaced = data.readUInt32LE(offset + 8)
          const wins = data.readUInt32LE(offset + 12)
          const losses = data.readUInt32LE(offset + 16)
          const gamesPlayed = data.readUInt32LE(offset + 20)
          // Skip referral_code (8) + referred_by (32) + referral_count (2)
          const tsOffset = offset + 24 + 8 + 32 + 2
          const registeredAt = Number(data.readBigInt64LE(tsOffset))
          const lastPlayedAt = Number(data.readBigInt64LE(tsOffset + 8))

          setStats({
            wallet,
            totalWagered,
            betsPlaced,
            wins,
            losses,
            gamesPlayed,
            registeredAt,
            lastPlayedAt,
          })
        } else {
          setStats(null)
        }
      } catch {
        setStats(null)
      }

      // Fetch challenges via getProgramAccounts
      try {
        const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
          filters: [
            { dataSize: 298 }, // Challenge account size (approximate)
          ],
        })

        const challenges: Challenge[] = []
        for (const { account } of accounts) {
          try {
            const data = account.data
            const d = 8 // discriminator offset
            const id = Number(data.readBigUInt64LE(d))
            const creator = new PublicKey(data.subarray(d + 8, d + 40)).toBase58()
            const acceptor = new PublicKey(data.subarray(d + 40, d + 72)).toBase58()
            const amountUsdc = Number(data.readBigUInt64LE(d + 72)) / 1e6
            const gameTypeByte = data[d + 80]
            const statusByte = data[d + 80 + 33] // after game_type (1) + game_params (32)

            const gameType = gameTypeByte === 0 ? 'Coinflip' : 'Dice'
            const statusMap: Record<number, string> = {
              0: 'open', 1: 'matched', 2: 'resolved',
              3: 'claimed', 4: 'cancelled', 5: 'expired'
            }
            const status = statusMap[statusByte] || 'unknown'
            const winner = new PublicKey(data.subarray(d + 147, d + 179)).toBase58()

            // timestamps at end of struct
            const tsBase = d + 211
            const createdAt = Number(data.readBigInt64LE(tsBase))
            const resolvedAt = Number(data.readBigInt64LE(tsBase + 24))

            if (creator === wallet || acceptor === wallet) {
              challenges.push({
                id, creator, acceptor, amountUsdc,
                gameType, status, winner, createdAt, resolvedAt,
              })
            }
          } catch {
            // Skip unparseable accounts
          }
        }

        challenges.sort((a, b) => b.createdAt - a.createdAt)
        setActiveChallenges(challenges.filter(c => c.status === 'open' || c.status === 'matched'))
        setHistory(challenges.filter(c => c.status !== 'open' && c.status !== 'matched'))
      } catch {
        setActiveChallenges([])
        setHistory([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [wallet])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [fetchData, lastRefresh])

  const winRate = stats && stats.gamesPlayed > 0
    ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1)
    : '0.0'

  const pnl = stats
    ? (stats.wins * stats.totalWagered / Math.max(stats.gamesPlayed, 1) * 0.95) -
      (stats.losses * stats.totalWagered / Math.max(stats.gamesPlayed, 1))
    : 0

  const formatTime = (ts: number) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '—'

  if (!wallet) {
    return (
      <div className="dashboard">
        <div className="dashboard-empty">
          <h2>Connect your wallet to view the dashboard</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Agent Dashboard</h1>
        <button
          className="btn btn-secondary"
          onClick={() => { setLastRefresh(Date.now()); fetchData() }}
        >
          Refresh
        </button>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {/* Agent Identity */}
      <div className="dashboard-panel identity-panel">
        <div className="identity-info">
          <span className="identity-label">Agent Wallet</span>
          <a
            href={`https://explorer.solana.com/address/${wallet}?cluster=devnet`}
            target="_blank"
            rel="noopener"
            className="identity-address"
          >
            {wallet}
          </a>
        </div>
        <div className={`identity-badge ${stats ? 'registered' : 'unregistered'}`}>
          {stats ? 'Registered' : 'Not Registered'}
        </div>
      </div>

      {/* Balance Cards */}
      <div className="dashboard-row">
        <div className="dashboard-panel balance-card">
          <span className="balance-card-label">SOL Balance</span>
          <span className="balance-card-value">{solBalance.toFixed(4)}</span>
          <span className="balance-card-sub">Transaction fees</span>
        </div>
        <div className="dashboard-panel balance-card">
          <span className="balance-card-label">USDC Balance</span>
          <span className="balance-card-value">{usdcBalance.toFixed(2)}</span>
          <span className="balance-card-sub">Wagering currency</span>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="dashboard-row stats-row">
          <div className="dashboard-panel stat-card">
            <span className="stat-card-value accent-teal">{stats.wins}</span>
            <span className="stat-card-label">Wins</span>
          </div>
          <div className="dashboard-panel stat-card">
            <span className="stat-card-value accent-red">{stats.losses}</span>
            <span className="stat-card-label">Losses</span>
          </div>
          <div className="dashboard-panel stat-card">
            <span className="stat-card-value">{winRate}%</span>
            <span className="stat-card-label">Win Rate</span>
          </div>
          <div className="dashboard-panel stat-card">
            <span className="stat-card-value accent-yellow">{stats.totalWagered.toFixed(2)}</span>
            <span className="stat-card-label">Total Wagered</span>
          </div>
          <div className="dashboard-panel stat-card">
            <span className={`stat-card-value ${pnl >= 0 ? 'outcome-win' : 'outcome-loss'}`}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
            </span>
            <span className="stat-card-label">Net P&L (USDC)</span>
          </div>
        </div>
      )}

      {/* Active Challenges */}
      <div className="dashboard-panel">
        <h2 className="panel-title">Active Challenges</h2>
        {loading && activeChallenges.length === 0 ? (
          <div className="panel-loading">Loading...</div>
        ) : activeChallenges.length === 0 ? (
          <div className="panel-empty">No active challenges</div>
        ) : (
          <table className="challenge-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Game</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Opponent</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {activeChallenges.map(c => (
                <tr key={c.id} className="challenge-row">
                  <td>#{c.id}</td>
                  <td>{c.gameType}</td>
                  <td>{c.amountUsdc} USDC</td>
                  <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                  <td>{c.creator === wallet ? shortAddr(c.acceptor) : shortAddr(c.creator)}</td>
                  <td>{formatTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Challenge History */}
      <div className="dashboard-panel">
        <h2 className="panel-title">Challenge History</h2>
        {loading && history.length === 0 ? (
          <div className="panel-loading">Loading...</div>
        ) : history.length === 0 ? (
          <div className="panel-empty">No challenge history yet</div>
        ) : (
          <table className="challenge-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Game</th>
                <th>Amount</th>
                <th>Result</th>
                <th>Opponent</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map(c => {
                const isWin = c.winner === wallet
                const isCancelled = c.status === 'cancelled'
                return (
                  <tr key={c.id} className="challenge-row">
                    <td>#{c.id}</td>
                    <td>{c.gameType}</td>
                    <td>{c.amountUsdc} USDC</td>
                    <td>
                      {isCancelled ? (
                        <span className="outcome-cancelled">Cancelled</span>
                      ) : (
                        <span className={isWin ? 'outcome-win' : 'outcome-loss'}>
                          {isWin ? 'WON' : 'LOST'} {isWin ? '+' : '-'}{(c.amountUsdc * (isWin ? 0.95 : 1)).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td>{c.creator === wallet ? shortAddr(c.acceptor) : shortAddr(c.creator)}</td>
                    <td>{formatTime(c.resolvedAt || c.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
