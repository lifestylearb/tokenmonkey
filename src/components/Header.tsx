import { Link, useLocation } from 'react-router-dom'
import { useGame } from '../store'
import Logo from './Logo'

interface HeaderProps {
  onConnectClick: () => void
}

export default function Header({ onConnectClick }: HeaderProps) {
  const { state, disconnectWallet, connectWallet } = useGame()
  const location = useLocation()

  const shortAddr = state.address
    ? `${state.address.slice(0, 4)}...${state.address.slice(-4)}`
    : ''

  return (
    <header className="header" data-testid="header">
      <Link to="/" className="logo" data-testid="logo">
        <Logo size={36} />
        <span className="logo-text">TOKEN<span className="accent-yellow">MONKEY</span></span>
      </Link>

      {state.connected && (
        <nav className="nav" data-testid="nav" aria-label="Game navigation">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} data-testid="nav-lobby">
            Lobby
          </Link>
          <Link to="/coinflip" className={`nav-link ${location.pathname === '/coinflip' ? 'active' : ''}`} data-testid="nav-coinflip">
            Coinflip
          </Link>
          <Link to="/dice" className={`nav-link ${location.pathname === '/dice' ? 'active' : ''}`} data-testid="nav-dice">
            Dice
          </Link>
          <Link to="/blackjack" className={`nav-link ${location.pathname === '/blackjack' ? 'active' : ''}`} data-testid="nav-blackjack">
            Blackjack
          </Link>
          <Link to="/roulette" className={`nav-link ${location.pathname === '/roulette' ? 'active' : ''}`} data-testid="nav-roulette">
            Roulette
          </Link>
          <Link to="/slots" className={`nav-link ${location.pathname === '/slots' ? 'active' : ''}`} data-testid="nav-slots">
            Slots
          </Link>
          <Link to="/dashboard" className={`nav-link nav-link-dashboard ${location.pathname === '/dashboard' ? 'active' : ''}`} data-testid="nav-dashboard">
            Dashboard
          </Link>
        </nav>
      )}

      <div className="header-right">
        {state.connected ? (
          <>
            <div className="balance-display" data-testid="balance-display" data-balance={state.balance}>
              <span className="balance-amount" data-testid="balance-amount">{state.balance.toLocaleString()}</span>
              <span className="balance-token">$MNKY</span>
            </div>
            {state.solBalance > 0 && (
              <div className="balance-display sol-balance">
                <span className="balance-amount">{state.solBalance.toFixed(2)}</span>
                <span className="balance-token">SOL</span>
              </div>
            )}
            <button
              className="wallet-info"
              onClick={disconnectWallet}
              aria-label={`Disconnect wallet ${shortAddr}`}
              data-testid="wallet-disconnect"
              data-address={state.address}
            >
              <div className="wallet-indicator" />
              <span>{shortAddr}</span>
            </button>
          </>
        ) : (
          <button className="btn btn-cta" onClick={connectWallet} data-testid="connect-wallet-btn">
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  )
}
