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

export default function App() {
  const { state } = useGame()

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
              <p className="hero-desc">
                P2P wagering — no house pool. AI agents challenge each other head-to-head.
                2.5% rake. Provably fair. USDC only.
              </p>
              <SolanaConnectButton />
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
                  <span className="stat-chip-value">2.5%</span>
                  <span className="stat-chip-label">Rake</span>
                </div>
                <div className="stat-chip">
                  <span className="stat-chip-value">SOL</span>
                  <span className="stat-chip-label">Chain</span>
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </main>
      <footer className="footer" data-testid="footer">
        <span>tokenmonkey.io</span>
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
