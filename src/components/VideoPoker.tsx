import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useGame, animDelay } from '../store'
import { Card, Rank } from '../types'
import { createDeck, isRed } from '../utils/cards'

type GamePhase = 'betting' | 'holding' | 'result'

interface PayoutEntry {
  name: string
  payout: number
}

const PAYOUTS: PayoutEntry[] = [
  { name: 'Royal Flush', payout: 800 },
  { name: 'Straight Flush', payout: 50 },
  { name: 'Four of a Kind', payout: 25 },
  { name: 'Full House', payout: 9 },
  { name: 'Flush', payout: 6 },
  { name: 'Straight', payout: 4 },
  { name: 'Three of a Kind', payout: 3 },
  { name: 'Two Pair', payout: 2 },
  { name: 'Jacks or Better', payout: 1 },
]

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

function getRankCounts(hand: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>()
  for (const card of hand) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1)
  }
  return counts
}

function isFlush(hand: Card[]): boolean {
  return hand.every(c => c.suit === hand[0].suit)
}

function getSortedValues(hand: Card[]): number[] {
  return hand.map(c => RANK_ORDER[c.rank]).sort((a, b) => a - b)
}

function isStraight(hand: Card[]): boolean {
  const vals = getSortedValues(hand)
  // Check normal straight
  const isNormal = vals.every((v, i) => i === 0 || v === vals[i - 1] + 1)
  if (isNormal) return true
  // Check A-2-3-4-5 (wheel)
  const wheel = [2, 3, 4, 5, 14]
  return vals.every((v, i) => v === wheel[i])
}

function isRoyalFlush(hand: Card[]): boolean {
  if (!isFlush(hand)) return false
  const vals = getSortedValues(hand)
  return vals[0] === 10 && vals[1] === 11 && vals[2] === 12 && vals[3] === 13 && vals[4] === 14
}

function evaluateHand(hand: Card[]): PayoutEntry | null {
  const counts = getRankCounts(hand)
  const freqs = Array.from(counts.values()).sort((a, b) => b - a)
  const flush = isFlush(hand)
  const straight = isStraight(hand)

  // Royal Flush
  if (isRoyalFlush(hand)) {
    return PAYOUTS[0]
  }

  // Straight Flush
  if (flush && straight) {
    return PAYOUTS[1]
  }

  // Four of a Kind
  if (freqs[0] === 4) {
    return PAYOUTS[2]
  }

  // Full House
  if (freqs[0] === 3 && freqs[1] === 2) {
    return PAYOUTS[3]
  }

  // Flush
  if (flush) {
    return PAYOUTS[4]
  }

  // Straight
  if (straight) {
    return PAYOUTS[5]
  }

  // Three of a Kind
  if (freqs[0] === 3) {
    return PAYOUTS[6]
  }

  // Two Pair
  if (freqs[0] === 2 && freqs[1] === 2) {
    return PAYOUTS[7]
  }

  // Jacks or Better (pair of J, Q, K, or A)
  if (freqs[0] === 2) {
    for (const [rank, count] of counts) {
      if (count === 2 && RANK_ORDER[rank] >= 11) {
        return PAYOUTS[8]
      }
    }
  }

  return null
}

const CHIP_VALUES = [
  { value: 5, label: '5', className: 'chip-5' },
  { value: 25, label: '25', className: 'chip-25' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 500, label: '500', className: 'chip-500' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 5000, label: '5K', className: 'chip-5k' },
]

export default function VideoPoker() {
  const { state, dispatch } = useGame()

  const [phase, setPhase] = useState<GamePhase>('betting')
  const [bet, setBet] = useState(10)
  const [hand, setHand] = useState<Card[]>([])
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false])
  const [deck, setDeck] = useState<Card[]>([])
  const [deckIndex, setDeckIndex] = useState(0)
  const [result, setResult] = useState<PayoutEntry | null>(null)
  const [winAmount, setWinAmount] = useState(0)
  const [resultMessage, setResultMessage] = useState('')

  const deal = useCallback(() => {
    if (bet <= 0 || bet > state.balance) return

    dispatch({ type: 'SUBTRACT_BALANCE', amount: bet })

    const newDeck = createDeck()
    const dealtHand = newDeck.slice(0, 5).map(c => ({ ...c, faceUp: true }))
    setDeck(newDeck)
    setDeckIndex(5)
    setHand(dealtHand)
    setHeld([false, false, false, false, false])
    setResult(null)
    setWinAmount(0)
    setResultMessage('')
    setPhase('holding')
  }, [bet, state.balance, dispatch])

  const toggleHold = useCallback((index: number) => {
    if (phase !== 'holding') return
    setHeld(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }, [phase])

  const draw = useCallback(() => {
    if (phase !== 'holding') return

    let nextIndex = deckIndex
    const newHand = hand.map((card, i) => {
      if (held[i]) return card
      const replacement = { ...deck[nextIndex], faceUp: true }
      nextIndex++
      return replacement
    })

    setHand(newHand)
    setDeckIndex(nextIndex)

    const handResult = evaluateHand(newHand)
    setResult(handResult)

    if (handResult) {
      const payout = handResult.payout * bet
      setWinAmount(payout)
      setResultMessage(`${handResult.name}! You win ${payout.toLocaleString()} $MNKY`)
      dispatch({ type: 'ADD_BALANCE', amount: payout })
    } else {
      setWinAmount(0)
      setResultMessage('No winning hand. Better luck next time!')
    }

    setPhase('result')
  }, [phase, deckIndex, hand, held, deck, bet, dispatch])

  const newGame = useCallback(() => {
    setPhase('betting')
    setHand([])
    setHeld([false, false, false, false, false])
    setResult(null)
    setWinAmount(0)
    setResultMessage('')
  }, [])

  const addChip = (value: number) => {
    setBet(prev => Math.min(prev + value, state.balance))
  }

  const handleBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0
    setBet(Math.max(0, Math.min(val, state.balance)))
  }

  return (
    <div className="game-container" data-testid="game-container" data-game="video-poker">
      <div data-testid="game-state" data-game="video-poker" data-phase={phase} data-balance={state.balance} data-bet={bet} data-hand-result={result?.name || ''} data-payout={winAmount || 0} style={{display:'none'}} />
      <div className="game-header">
        <h1>Video Poker</h1>
        <Link to="/" className="btn btn-sm">Back to Lobby</Link>
      </div>

      {/* Payout Table */}
      <div className="payout-table">
        {PAYOUTS.map(entry => (
          <div
            key={entry.name}
            className={`payout-row${result && result.name === entry.name ? ' active-hand' : ''}`}
            data-testid={`payout-${entry.name.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <span className="payout-name">{entry.name}</span>
            <span className="payout-mult">{entry.payout}x</span>
          </div>
        ))}
      </div>

      {/* Game Table */}
      <div className="game-table">
        {/* Hand Display */}
        {hand.length > 0 ? (
          <div className="poker-hand">
            {hand.map((card, i) => (
              <button
                key={i}
                className="poker-card-wrapper"
                data-testid={`poker-card-${i}`}
                data-rank={card.rank}
                data-suit={card.suit}
                data-held={held[i]}
                aria-label={`Hold/release ${card.rank} of ${card.suit}`}
                aria-pressed={held[i]}
                onClick={() => toggleHold(i)}
              >
                <div
                  className={[
                    'card-display',
                    card.faceUp ? 'face-up' : 'face-down',
                    card.faceUp && isRed(card.suit) ? 'red' : '',
                    held[i] ? 'held' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {card.faceUp ? `${card.rank}${card.suit}` : ''}
                </div>
                <span className="held-label">
                  {phase === 'holding' && held[i] ? 'HELD' : ''}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="poker-hand" style={{ minHeight: 140, alignItems: 'center', justifyContent: 'center' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="poker-card-wrapper">
                <div className="card-display face-down" />
              </div>
            ))}
          </div>
        )}

        {/* Phase: Holding - show instructions */}
        {phase === 'holding' && (
          <div style={{ textAlign: 'center', marginTop: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
            Click cards to hold, then press Draw
          </div>
        )}

        {/* Result Message */}
        <div data-testid="game-result" aria-live="polite">
          {phase === 'result' && resultMessage && (
            <div className={`game-result ${winAmount > 0 ? 'win' : 'lose'}`}>
              {resultMessage}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="game-actions">
          {phase === 'betting' && (
            <>
              <button
                className="btn btn-primary"
                data-testid="poker-deal"
                onClick={deal}
                disabled={bet <= 0 || bet > state.balance}
              >
                Deal
              </button>
            </>
          )}

          {phase === 'holding' && (
            <>
              <button className="btn btn-primary" data-testid="poker-draw" onClick={draw}>
                Draw
              </button>
              <button
                className="btn"
                data-testid="poker-hold-all"
                onClick={() => setHeld([true, true, true, true, true])}
              >
                Hold All
              </button>
              <button
                className="btn"
                data-testid="poker-clear-holds"
                onClick={() => setHeld([false, false, false, false, false])}
              >
                Clear Holds
              </button>
            </>
          )}

          {phase === 'result' && (
            <button className="btn btn-primary" data-testid="poker-new-hand" onClick={newGame}>
              New Hand
            </button>
          )}
        </div>
      </div>

      {/* Bet Area - visible during betting phase */}
      {phase === 'betting' && (
        <div className="bet-area" style={{ flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>BET</label>
            <input
              type="number"
              className="bet-input"
              data-testid="poker-bet-input"
              aria-label="Bet amount"
              value={bet}
              onChange={handleBetChange}
              min={1}
              max={state.balance}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>$MNKY</span>
          </div>
          <div className="chip-buttons">
            {CHIP_VALUES.map(chip => (
              <button
                key={chip.value}
                className={`chip ${chip.className}`}
                data-testid={`chip-${chip.value}`}
                onClick={() => addChip(chip.value)}
                disabled={state.balance < chip.value}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game Info */}
      <div className="game-info">
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Balance: <strong style={{ color: 'var(--green)' }}>{state.balance.toLocaleString()} $MNKY</strong>
        </span>
        {phase !== 'betting' && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Bet: <strong style={{ color: 'var(--accent)' }}>{bet.toLocaleString()} $MNKY</strong>
          </span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          House Edge: ~2.5%
        </span>
      </div>
    </div>
  )
}
