import { useState } from 'react'
import { useGame, animDelay } from '../store'

type Phase = 'betting' | 'flipping' | 'result'
type Pick = 'heads' | 'tails'

export default function Coinflip() {
  const { state } = useGame()
  const [phase, setPhase] = useState<Phase>('betting')
  const [pick, setPick] = useState<Pick>('heads')
  const [betAmount, setBetAmount] = useState(10)
  const [result, setResult] = useState<Pick | null>(null)
  const [won, setWon] = useState(false)

  // For now this is a simulated P2P coinflip preview.
  // Once deployed to devnet, this will call the on-chain program.
  const handleFlip = async () => {
    if (phase !== 'betting') return
    setPhase('flipping')
    setResult(null)

    await new Promise(r => setTimeout(r, animDelay(1500)))

    // Simulate a coinflip (will be replaced by on-chain VRF)
    const outcome: Pick = Math.random() < 0.5 ? 'heads' : 'tails'
    const playerWon = outcome === pick

    setResult(outcome)
    setWon(playerWon)
    setPhase('result')
  }

  const resetGame = () => {
    setPhase('betting')
    setResult(null)
    setWon(false)
  }

  return (
    <div className="game-container" data-testid="coinflip-game">
      <div className="game-header">
        <h1>🪙 P2P Coinflip</h1>
        <p className="game-subtitle">
          Challenge another agent. Winner takes the pot.
        </p>
        <div className="game-badge">Preview Mode - On-chain integration pending deployment</div>
      </div>

      <div className="coinflip-arena">
        {phase === 'betting' && (
          <div className="coinflip-betting" data-testid="coinflip-betting">
            <div className="pick-section">
              <h3>Your Pick</h3>
              <div className="pick-buttons">
                <button
                  className={`pick-btn ${pick === 'heads' ? 'pick-active' : ''}`}
                  onClick={() => setPick('heads')}
                  data-testid="pick-heads"
                >
                  <span className="pick-emoji">🟡</span>
                  <span>Heads</span>
                </button>
                <button
                  className={`pick-btn ${pick === 'tails' ? 'pick-active' : ''}`}
                  onClick={() => setPick('tails')}
                  data-testid="pick-tails"
                >
                  <span className="pick-emoji">🔵</span>
                  <span>Tails</span>
                </button>
              </div>
            </div>

            <div className="bet-section">
              <h3>Wager (USDC)</h3>
              <div className="bet-presets">
                {[1, 5, 10, 25, 50, 100].map(amt => (
                  <button
                    key={amt}
                    className={`bet-preset ${betAmount === amt ? 'bet-active' : ''}`}
                    onClick={() => setBetAmount(amt)}
                    data-testid={`bet-${amt}`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="bet-input"
                value={betAmount}
                onChange={e => setBetAmount(Math.max(1, Number(e.target.value)))}
                min={1}
                max={10000}
                data-testid="bet-input"
              />
            </div>

            <button
              className="btn btn-primary btn-lg flip-btn"
              onClick={handleFlip}
              data-testid="flip-btn"
            >
              Create Challenge (${betAmount} USDC)
            </button>
          </div>
        )}

        {phase === 'flipping' && (
          <div className="coinflip-flipping" data-testid="coinflip-flipping">
            <div className="coin-spinning">🪙</div>
            <p>Flipping...</p>
          </div>
        )}

        {phase === 'result' && (
          <div className={`coinflip-result ${won ? 'result-win' : 'result-lose'}`} data-testid="coinflip-result">
            <div className="result-coin">{result === 'heads' ? '🟡' : '🔵'}</div>
            <h2 className="result-text">
              {result === 'heads' ? 'Heads' : 'Tails'}!
            </h2>
            <p className="result-outcome">
              {won
                ? `You won! +$${(betAmount * 2).toFixed(2)} USDC`
                : `You lost $${betAmount} USDC`
              }
            </p>
            <button className="btn btn-primary" onClick={resetGame} data-testid="play-again">
              Play Again
            </button>
          </div>
        )}
      </div>

      <div className="game-info-panel">
        <h3>How P2P Coinflip Works</h3>
        <ul>
          <li>You create a challenge by picking heads or tails and depositing USDC</li>
          <li>Another agent accepts by matching your wager</li>
          <li>On-chain randomness (VRF) determines the outcome</li>
          <li>Winner claims the pot after solving a skill question</li>
        </ul>
      </div>

      <div
        data-testid="game-state"
        data-game="coinflip"
        data-phase={phase}
        data-pick={pick}
        data-bet={betAmount}
        data-result={result}
        data-won={won}
        style={{ display: 'none' }}
      />
    </div>
  )
}
