import { useState } from 'react'
import { useGame, animDelay } from '../store'

type Phase = 'betting' | 'rolling' | 'result'
type Direction = 'over' | 'under'

export default function Dice() {
  const { state } = useGame()
  const [phase, setPhase] = useState<Phase>('betting')
  const [target, setTarget] = useState(7)
  const [direction, setDirection] = useState<Direction>('over')
  const [betAmount, setBetAmount] = useState(10)
  const [dice, setDice] = useState<[number, number]>([0, 0])
  const [won, setWon] = useState(false)

  const handleRoll = async () => {
    if (phase !== 'betting') return
    setPhase('rolling')

    await new Promise(r => setTimeout(r, animDelay(1500)))

    // Simulate dice roll (will be replaced by on-chain VRF)
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    const total = d1 + d2
    const playerWon = direction === 'over' ? total > target : total < target

    setDice([d1, d2])
    setWon(playerWon)
    setPhase('result')
  }

  const resetGame = () => {
    setPhase('betting')
    setDice([0, 0])
    setWon(false)
  }

  const diceEmoji = (n: number) => ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n] || '🎲'

  return (
    <div className="game-container" data-testid="dice-game">
      <div className="game-header">
        <h1>🎲 P2P Dice</h1>
        <p className="game-subtitle">
          Pick over or under a target. P2P challenge on Solana.
        </p>
        <div className="game-badge">Preview Mode - On-chain integration pending deployment</div>
      </div>

      <div className="dice-arena">
        {phase === 'betting' && (
          <div className="dice-betting" data-testid="dice-betting">
            <div className="target-section">
              <h3>Target: {target}</h3>
              <input
                type="range"
                min={3}
                max={11}
                value={target}
                onChange={e => setTarget(Number(e.target.value))}
                className="target-slider"
                data-testid="target-slider"
              />
              <div className="target-labels">
                <span>3</span>
                <span>7</span>
                <span>11</span>
              </div>
            </div>

            <div className="direction-section">
              <h3>Direction</h3>
              <div className="pick-buttons">
                <button
                  className={`pick-btn ${direction === 'over' ? 'pick-active' : ''}`}
                  onClick={() => setDirection('over')}
                  data-testid="dir-over"
                >
                  <span className="pick-emoji">⬆️</span>
                  <span>Over {target}</span>
                </button>
                <button
                  className={`pick-btn ${direction === 'under' ? 'pick-active' : ''}`}
                  onClick={() => setDirection('under')}
                  data-testid="dir-under"
                >
                  <span className="pick-emoji">⬇️</span>
                  <span>Under {target}</span>
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
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleRoll}
              data-testid="roll-btn"
            >
              Create Challenge (${betAmount} USDC)
            </button>
          </div>
        )}

        {phase === 'rolling' && (
          <div className="dice-rolling" data-testid="dice-rolling">
            <div className="dice-shaking">🎲🎲</div>
            <p>Rolling...</p>
          </div>
        )}

        {phase === 'result' && (
          <div className={`dice-result ${won ? 'result-win' : 'result-lose'}`} data-testid="dice-result">
            <div className="dice-display">
              <span className="die">{diceEmoji(dice[0])}</span>
              <span className="die">{diceEmoji(dice[1])}</span>
            </div>
            <h2 className="result-text">
              {dice[0]} + {dice[1]} = {dice[0] + dice[1]}
            </h2>
            <p className="result-detail">
              Target: {direction === 'over' ? '>' : '<'} {target}
            </p>
            <p className="result-outcome">
              {won
                ? `You won! +$${(betAmount * 2 * 0.975).toFixed(2)} USDC (after 2.5% rake)`
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
        <h3>How P2P Dice Works</h3>
        <ul>
          <li>Pick a target number (3-11) and direction (over/under)</li>
          <li>Two dice are rolled (range 2-12)</li>
          <li>If the sum matches your prediction, you win</li>
          <li>On-chain randomness ensures fairness</li>
          <li>2.5% rake on every pot</li>
        </ul>
      </div>

      <div
        data-testid="game-state"
        data-game="dice"
        data-phase={phase}
        data-target={target}
        data-direction={direction}
        data-bet={betAmount}
        data-dice-1={dice[0]}
        data-dice-2={dice[1]}
        data-won={won}
        style={{ display: 'none' }}
      />
    </div>
  )
}
