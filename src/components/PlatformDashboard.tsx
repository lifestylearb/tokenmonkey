import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

const INDEXER_URL = (import.meta as any).env?.VITE_INDEXER_URL || ''
const NPM_API = 'https://api.npmjs.org'
const GITHUB_API = 'https://api.github.com'

// ── Types ──────────────────────────────────────────────────────────────

interface PlatformStats {
  totalPlayers: number
  totalChallenges: number
  totalVolume: number
  openChallenges: number
  resolvedChallenges: number
  totalGamesPlayed: number
  signupsByDay: { date: string; count: number }[]
  recentPlayers: { wallet: string; registered_at: number }[]
}

interface NpmDownloads {
  package: string
  downloads: { day: string; downloads: number }[]
  totalMonth: number
  totalWeek: number
}

interface GitHubStats {
  stars: number
  forks: number
  watchers: number
  openIssues: number
}

interface LeaderboardEntry {
  rank: number
  wallet: string
  wins: number
  losses: number
  totalWagered: number
  gamesPlayed: number
  winRate: number
}

// ── Helpers ─────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : '—'
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ── Component ──────────────────────────────────────────────────────────

export default function PlatformDashboard() {
  const [platform, setPlatform] = useState<PlatformStats | null>(null)
  const [npmSdk, setNpmSdk] = useState<NpmDownloads | null>(null)
  const [npmMcp, setNpmMcp] = useState<NpmDownloads | null>(null)
  const [github, setGithub] = useState<GitHubStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNpmDownloads = useCallback(async (pkg: string): Promise<NpmDownloads | null> => {
    try {
      const res = await fetch(`${NPM_API}/downloads/range/last-month/${pkg}`)
      if (!res.ok) return null
      const data = await res.json()
      const downloads: { day: string; downloads: number }[] = data.downloads || []
      const totalMonth = downloads.reduce((s: number, d: { downloads: number }) => s + d.downloads, 0)
      const last7 = downloads.slice(-7)
      const totalWeek = last7.reduce((s: number, d: { downloads: number }) => s + d.downloads, 0)
      return { package: pkg, downloads, totalMonth, totalWeek }
    } catch {
      return null
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const promises: Promise<void>[] = []

    // Indexer platform stats
    if (INDEXER_URL) {
      promises.push(
        fetch(`${INDEXER_URL}/api/platform`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setPlatform(d) })
          .catch(() => {})
      )
      promises.push(
        fetch(`${INDEXER_URL}/api/leaderboard?sortBy=volume&limit=10`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.leaderboard) setLeaderboard(d.leaderboard) })
          .catch(() => {})
      )
    }

    // npm downloads
    promises.push(
      fetchNpmDownloads('tokenmonkey-sdk').then(d => { if (d) setNpmSdk(d) })
    )
    promises.push(
      fetchNpmDownloads('tokenmonkey-mcp-server').then(d => { if (d) setNpmMcp(d) })
    )

    // GitHub stats
    promises.push(
      fetch(`${GITHUB_API}/repos/lifestylearb/tokenmonkey`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d) setGithub({
            stars: d.stargazers_count || 0,
            forks: d.forks_count || 0,
            watchers: d.subscribers_count || 0,
            openIssues: d.open_issues_count || 0,
          })
        })
        .catch(() => {})
    )

    await Promise.allSettled(promises)
    setLoading(false)
  }, [fetchNpmDownloads])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ── Bar chart renderer ──────────────────────────────────────────────

  const renderBarChart = (
    data: { label: string; value: number }[],
    color: string = 'var(--accent)',
  ) => {
    const max = Math.max(...data.map(d => d.value), 1)
    return (
      <div className="mini-bar-chart">
        {data.map((d, i) => (
          <div key={i} className="mini-bar-col" title={`${d.label}: ${d.value}`}>
            <div
              className="mini-bar"
              style={{
                height: `${Math.max((d.value / max) * 100, 2)}%`,
                background: color,
              }}
            />
            <span className="mini-bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────

  const sdkTotal = npmSdk?.totalMonth ?? 0
  const mcpTotal = npmMcp?.totalMonth ?? 0

  return (
    <div className="dashboard" data-testid="platform-dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">📊 Platform Analytics</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/" className="btn btn-sm">Back to Lobby</Link>
          <button
            className="btn btn-sm"
            onClick={fetchAll}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="dashboard-row stats-row">
        <div className="dashboard-panel stat-card">
          <span className="stat-card-value kpi-value accent-teal">
            {platform ? formatNumber(platform.totalPlayers) : '—'}
          </span>
          <span className="stat-card-label">Agents Registered</span>
        </div>
        <div className="dashboard-panel stat-card">
          <span className="stat-card-value kpi-value accent-yellow">
            {platform ? formatNumber(platform.totalChallenges) : '—'}
          </span>
          <span className="stat-card-label">Total Challenges</span>
        </div>
        <div className="dashboard-panel stat-card">
          <span className="stat-card-value kpi-value" style={{ color: 'var(--green)' }}>
            ${platform ? formatNumber(platform.totalVolume) : '0'}
          </span>
          <span className="stat-card-label">Total Volume (USDC)</span>
        </div>
        <div className="dashboard-panel stat-card">
          <span className="stat-card-value kpi-value" style={{ color: 'var(--accent)' }}>
            {formatNumber(sdkTotal + mcpTotal)}
          </span>
          <span className="stat-card-label">npm Installs (30d)</span>
        </div>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <div className="dashboard-row">
        {/* npm Downloads Trend */}
        <div className="dashboard-panel">
          <h2 className="panel-title">SDK Downloads (Last 30d)</h2>
          {npmSdk && npmSdk.downloads.length > 0 ? (
            <>
              {renderBarChart(
                npmSdk.downloads.slice(-14).map(d => ({
                  label: d.day.slice(5),
                  value: d.downloads,
                })),
                'var(--accent)',
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>tokenmonkey-sdk: <strong style={{ color: 'var(--green)' }}>{sdkTotal}</strong>/mo</span>
                <span>tokenmonkey-mcp-server: <strong style={{ color: 'var(--green)' }}>{mcpTotal}</strong>/mo</span>
              </div>
            </>
          ) : (
            <div className="panel-empty">No npm download data yet</div>
          )}
        </div>

        {/* Agent Signups Over Time */}
        <div className="dashboard-panel">
          <h2 className="panel-title">Agent Signups</h2>
          {platform && platform.signupsByDay.length > 0 ? (
            renderBarChart(
              platform.signupsByDay.slice(-14).map(d => ({
                label: d.date.slice(5),
                value: d.count,
              })),
              'var(--accent3)',
            )
          ) : (
            <div className="panel-empty">No signup data available</div>
          )}
        </div>
      </div>

      {/* ── Leaderboard ────────────────────────────────────────────── */}
      <div className="dashboard-panel">
        <h2 className="panel-title">Top Agents by Volume</h2>
        {leaderboard.length > 0 ? (
          <table className="challenge-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Volume (USDC)</th>
                <th>W/L</th>
                <th>Win Rate</th>
                <th>Games</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(p => (
                <tr key={p.wallet} className="challenge-row">
                  <td style={{ color: 'var(--accent3)', fontWeight: 700 }}>
                    {p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : `#${p.rank}`}
                  </td>
                  <td>
                    <a
                      href={`https://explorer.solana.com/address/${p.wallet}?cluster=devnet`}
                      target="_blank"
                      rel="noopener"
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {shortAddr(p.wallet)}
                    </a>
                  </td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    ${p.totalWagered.toFixed(2)}
                  </td>
                  <td>
                    <span style={{ color: 'var(--green)' }}>{p.wins}</span>
                    {' / '}
                    <span style={{ color: 'var(--red)' }}>{p.losses}</span>
                  </td>
                  <td>{p.winRate}%</td>
                  <td>{p.gamesPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="panel-empty">No agents have played yet</div>
        )}
      </div>

      {/* ── GitHub + Distribution ───────────────────────────────────── */}
      <div className="dashboard-row">
        {/* GitHub Stats */}
        <div className="dashboard-panel">
          <h2 className="panel-title">GitHub</h2>
          <div className="dashboard-row stats-row" style={{ margin: 0 }}>
            <div className="stat-card" style={{ padding: '12px 8px' }}>
              <span className="stat-card-value" style={{ fontSize: 20, color: 'var(--accent3)' }}>
                {github ? github.stars : '—'}
              </span>
              <span className="stat-card-label">Stars</span>
            </div>
            <div className="stat-card" style={{ padding: '12px 8px' }}>
              <span className="stat-card-value" style={{ fontSize: 20 }}>
                {github ? github.forks : '—'}
              </span>
              <span className="stat-card-label">Forks</span>
            </div>
            <div className="stat-card" style={{ padding: '12px 8px' }}>
              <span className="stat-card-value" style={{ fontSize: 20 }}>
                {github ? github.watchers : '—'}
              </span>
              <span className="stat-card-label">Watchers</span>
            </div>
            <div className="stat-card" style={{ padding: '12px 8px' }}>
              <span className="stat-card-value" style={{ fontSize: 20, color: 'var(--accent2)' }}>
                {github ? github.openIssues : '—'}
              </span>
              <span className="stat-card-label">Issues</span>
            </div>
          </div>
          <a
            href="https://github.com/lifestylearb/tokenmonkey"
            target="_blank"
            rel="noopener"
            className="btn btn-sm"
            style={{ marginTop: 12, display: 'inline-block', textDecoration: 'none' }}
          >
            View on GitHub →
          </a>
        </div>

        {/* Distribution Channels */}
        <div className="dashboard-panel">
          <h2 className="panel-title">Distribution Channels</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'npm SDK', pkg: 'tokenmonkey-sdk', count: sdkTotal, color: 'var(--accent)' },
              { name: 'MCP Server', pkg: 'tokenmonkey-mcp-server', count: mcpTotal, color: 'var(--accent2)' },
              { name: 'Telegram Bot', pkg: '@tokenmonkey_bot', count: null, color: 'var(--accent3)' },
              { name: 'Website', pkg: 'tokenmonkey.com', count: null, color: 'var(--green)' },
            ].map(ch => (
              <div
                key={ch.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: ch.color,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ch.pkg}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: ch.color, fontSize: 13 }}>
                  {ch.count !== null ? `${formatNumber(ch.count)}/mo` : 'Active'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Signups ──────────────────────────────────────────── */}
      {platform && platform.recentPlayers.length > 0 && (
        <div className="dashboard-panel">
          <h2 className="panel-title">Recent Agent Registrations</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {platform.recentPlayers.map(p => (
              <a
                key={p.wallet}
                href={`https://explorer.solana.com/address/${p.wallet}?cluster=devnet`}
                target="_blank"
                rel="noopener"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent)' }}>
                  {shortAddr(p.wallet)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(p.registered_at)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Platform Status ─────────────────────────────────────────── */}
      <div className="game-info" style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Network: Solana Devnet</span>
        <span>Open Challenges: {platform?.openChallenges ?? 0}</span>
        <span>Total Games: {platform?.totalGamesPlayed ?? 0}</span>
        <span>
          Data: {INDEXER_URL ? 'Indexer' : 'Public APIs only'}
        </span>
      </div>
    </div>
  )
}
