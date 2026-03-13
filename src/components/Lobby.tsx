import { Link } from 'react-router-dom'
import { useGame } from '../store'

const p2pGames = [
  { path: '/coinflip', name: 'Coinflip', emoji: '🪙', desc: 'Heads or tails. P2P challenge. Winner takes all minus 2.5% rake.', minBet: '1 USDC', tag: 'ON-CHAIN' },
  { path: '/dice', name: 'Dice', emoji: '🎲', desc: 'Over/under dice roll. P2P challenge. Provably fair on Solana.', minBet: '1 USDC', tag: 'ON-CHAIN' },
]

const simulatedGames = [
  { path: '/blackjack', name: 'Blackjack', emoji: '🃏', desc: 'Classic 21. Beat the dealer without going bust.', edge: '0.5%', minBet: 10, tag: 'SIMULATED' },
  { path: '/roulette', name: 'Roulette', emoji: '🎰', desc: 'American roulette. Pick your numbers, spin the wheel.', edge: '5.26%', minBet: 5, tag: 'SIMULATED' },
  { path: '/slots', name: 'Slots', emoji: '🍒', desc: 'Multi-line slots with wild multipliers.', edge: '5%', minBet: 1, tag: 'SIMULATED' },
  { path: '/video-poker', name: 'Video Poker', emoji: '🎴', desc: 'Jacks or Better. Draw for the best hand.', edge: '2.5%', minBet: 5, tag: 'SIMULATED' },
  { path: '/baccarat', name: 'Baccarat', emoji: '👑', desc: 'Player vs Banker. Bet on the winning hand.', edge: '1.06%', minBet: 25, tag: 'SIMULATED' },
  { path: '/craps', name: 'Craps', emoji: '🎲', desc: 'Roll the dice. Pass line, don\'t pass, and more.', edge: '1.41%', minBet: 10, tag: 'SIMULATED' },
]

export default function Lobby() {
  const { state, dispatch } = useGame()

  return (
    <div className="lobby" data-testid="lobby">
      <div className="lobby-header">
        <h1>Game Lobby</h1>
        <p>P2P on-chain games use USDC on Solana. Simulated games use $MNKY tokens.</p>
        {state.balance < 100 && (
          <button
            className="btn btn-accent"
            onClick={() => dispatch({ type: 'ADD_BALANCE', amount: 10000 })}
            data-testid="faucet-btn"
            aria-label="Claim 10,000 free MNKY tokens"
          >
            Claim 10,000 $MNKY (Simulated Games)
          </button>
        )}
      </div>

      <h2 className="lobby-section-title">P2P On-Chain Games (USDC)</h2>
      <div className="game-grid" data-testid="game-grid-p2p" role="list">
        {p2pGames.map(game => (
          <Link
            to={game.path}
            key={game.path}
            className="game-card game-card-p2p"
            role="listitem"
            data-testid={`game-card-${game.path.slice(1)}`}
            data-game={game.path.slice(1)}
          >
            <div className="game-card-tag game-card-tag-p2p">{game.tag}</div>
            <div className="game-card-emoji">{game.emoji}</div>
            <h3 className="game-card-name">{game.name}</h3>
            <p className="game-card-desc">{game.desc}</p>
            <div className="game-card-stats">
              <div className="game-stat">
                <span className="game-stat-label">Min Bet</span>
                <span className="game-stat-value">{game.minBet}</span>
              </div>
              <div className="game-stat">
                <span className="game-stat-label">Rake</span>
                <span className="game-stat-value">2.5%</span>
              </div>
            </div>
            <div className="game-card-play">Play Now →</div>
          </Link>
        ))}
      </div>

      <h2 className="lobby-section-title">Simulated Games ($MNKY)</h2>
      <div className="game-grid" data-testid="game-grid-simulated" role="list">
        {simulatedGames.map(game => (
          <Link
            to={game.path}
            key={game.path}
            className="game-card"
            role="listitem"
            data-testid={`game-card-${game.path.slice(1)}`}
            data-game={game.path.slice(1)}
            data-house-edge={game.edge}
            data-min-bet={game.minBet}
          >
            <div className="game-card-tag">{game.tag}</div>
            <div className="game-card-emoji">{game.emoji}</div>
            <h3 className="game-card-name">{game.name}</h3>
            <p className="game-card-desc">{game.desc}</p>
            <div className="game-card-stats">
              <div className="game-stat">
                <span className="game-stat-label">House Edge</span>
                <span className="game-stat-value">{game.edge}</span>
              </div>
              <div className="game-stat">
                <span className="game-stat-label">Min Bet</span>
                <span className="game-stat-value">{game.minBet} $MNKY</span>
              </div>
            </div>
            <div className="game-card-play">Play Now →</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
