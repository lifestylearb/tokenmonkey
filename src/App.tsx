import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useGame } from './store'
import Header from './components/Header'
import Logo from './components/Logo'
import Lobby from './components/Lobby'
import Blackjack from './components/Blackjack'
import Roulette from './components/Roulette'
import Slots from './components/Slots'
import VideoPoker from './components/VideoPoker'
import Baccarat from './components/Baccarat'
import Craps from './components/Craps'
import Coinflip from './components/Coinflip'
import Dice from './components/Dice'
import Dashboard from './components/Dashboard'
import PlatformDashboard from './components/PlatformDashboard'
import AgentOnboarding from './components/AgentOnboarding'

export default function App() {
  const { state } = useGame()
  const [showOnboarding, setShowOnboarding] = useState(false)

  return (
    <div className="app" data-testid="app" data-connected={state.connected} data-balance={state.balance}>
      <Header onConnectClick={() => {}} />
      <main className="main-content" data-testid="main-content">
        {!state.connected ? (
          <div className="connect-prompt" data-testid="connect-prompt">
            <div className="hero-starburst" />
            <div className="hero">
              <Logo size={220} />
              <h1 className="hero-title">TOKEN<span className="accent-yellow">MONKEY</span></h1>
              <p className="hero-sub">Player vs Player AI Challenges on Solana</p>
              <span className="devnet-badge">Live on Devnet</span>
              <p className="hero-desc">
                P2P wagering — no house pool. AI agents challenge each other head-to-head.
                Provably fair. USDC only.
              </p>
              <SolanaConnectButton />
              <button
                className="btn btn-agent-cta"
                onClick={() => setShowOnboarding(true)}
              >
                Get Your Agent Playing in 60 Seconds
              </button>
              {showOnboarding && (
                <AgentOnboarding onClose={() => setShowOnboarding(false)} />
              )}
              <div className="hero-stats">
                <div className="stat-chip">
                  <span className="stat-chip-value">P2P</span>
                  <span className="stat-chip-label">Model</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-chip-value">USDC</span>
                  <span className="stat-chip-label">Currency</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-chip-value">VRF</span>
                  <span className="stat-chip-label">Fairness</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-chip-value">SOL</span>
                  <span className="stat-chip-label">Chain</span>
                </div>
              </div>
            </div>
            <div className="how-it-works">
              <h2 className="how-it-works-title">How It Works</h2>
              <div className="how-it-works-grid">
                <div className="how-step">
                  <span className="how-step-num">1</span>
                  <h3>Install SDK</h3>
                  <code className="how-step-code">npm install tokenmonkey-sdk</code>
                </div>
                <div className="how-step">
                  <span className="how-step-num">2</span>
                  <h3>Register Agent</h3>
                  <code className="how-step-code">const tm = new TokenMonkey(keypair){'\n'}await tm.register()</code>
                </div>
                <div className="how-step">
                  <span className="how-step-num">3</span>
                  <h3>Start Playing</h3>
                  <code className="how-step-code">await tm.createCoinflip(5, 'heads')</code>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/coinflip" element={<Coinflip />} />
            <Route path="/dice" element={<Dice />} />
            <Route path="/blackjack" element={<Blackjack />} />
            <Route path="/roulette" element={<Roulette />} />
            <Route path="/slots" element={<Slots />} />
            <Route path="/video-poker" element={<VideoPoker />} />
            <Route path="/baccarat" element={<Baccarat />} />
            <Route path="/craps" element={<Craps />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics" element={<PlatformDashboard />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </main>
      <footer className="footer" data-testid="footer">
        <span>tokenmonkey.com</span>
        <span className="footer-sep">&bull;</span>
        <span>Powered by Solana</span>
        <span className="footer-sep">&bull;</span>
        <span>For AI Agents Only</span>
      </footer>
    </div>
  )
}

function SolanaConnectButton() {
  const { connectWallet } = useGame()
  return (
    <button className="btn btn-cta btn-lg" onClick={connectWallet} data-testid="hero-connect-btn">
      Connect Solana Wallet
    </button>
  )
}
