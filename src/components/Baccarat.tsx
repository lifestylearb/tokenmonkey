import { useState, useRef, useCallback, useEffect } from 'react'
import { useGame, animDelay } from '../store'
import { Card } from '../types'
import { createDeck, isRed } from '../utils/cards'
import { Link } from 'react-router-dom'

// ── Types ──────────────────────────────────────────────────────────────

type BetType = 'player' | 'banker' | 'tie'

type GamePhase =
  | 'betting'    // Place bets
  | 'dealing'    // Animated deal in progress
  | 'result'     // Round over, showing outcome

interface DealStep {
  target: 'player' | 'banker'
  card: Card
  delay: number
}

// ── Card value helpers (baccarat-specific) ─────────────────────────────

function baccaratCardValue(card: Card): number {
  if (card.rank === 'A') return 1
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 0
  return parseInt(card.rank)
}

function baccaratHandTotal(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + baccaratCardValue(c), 0) % 10
}

// ── Third card rules (Punto Banco) ─────────────────────────────────────

function playerDrawsThird(playerTotal: number): boolean {
  return playerTotal <= 5
}

function bankerDrawsThird(
  bankerTotal: number,
  playerDrewThird: boolean,
  playerThirdCardValue: number | null,
): boolean {
  // If the player did NOT draw a third card, banker draws on 0–5, stands on 6–7
  if (!playerDrewThird) {
    return bankerTotal <= 5
  }

  // Standard banker third-card tableau based on player's third card value
  const p = playerThirdCardValue!

  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true
    case 3:
      return p !== 8
    case 4:
      return p >= 2 && p <= 7
    case 5:
      return p >= 4 && p <= 7
    case 6:
      return p === 6 || p === 7
    case 7:
      return false
    default:
      return false
  }
}

// ── Component ──────────────────────────────────────────────────────────

export default function Baccarat() {
  const { state, dispatch } = useGame()

  // Deck & shoe
  const shoeRef = useRef<Card[]>(createDeck(8))

  // Game state
  const [phase, setPhase] = useState<GamePhase>('betting')
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [bankerHand, setBankerHand] = useState<Card[]>([])

  // Betting
  const [selectedBet, setSelectedBet] = useState<BetType>('banker')
  const [betAmount, setBetAmount] = useState(100)

  // Result
  const [resultMessage, setResultMessage] = useState('')
  const [resultClass, setResultClass] = useState<'win' | 'lose' | 'push'>('lose')
  const [winnerSide, setWinnerSide] = useState<'player' | 'banker' | 'tie' | null>(null)

  // Dealing animation tracking
  const [visiblePlayerCards, setVisiblePlayerCards] = useState(0)
  const [visibleBankerCards, setVisibleBankerCards] = useState(0)

  // Stats
  const [stats, setStats] = useState({ played: 0, won: 0, lost: 0 })

  // ── Draw a card from the shoe ─────────────────────────────────────

  const drawCard = useCallback((): Card => {
    if (shoeRef.current.length < 20) {
      shoeRef.current = createDeck(8)
    }
    return shoeRef.current.pop()!
  }, [])

  // ── Chip buttons ──────────────────────────────────────────────────

  const chipValues = [
    { value: 5, label: '5', cls: 'chip-5' },
    { value: 25, label: '25', cls: 'chip-25' },
    { value: 100, label: '100', cls: 'chip-100' },
    { value: 500, label: '500', cls: 'chip-500' },
    { value: 1000, label: '1K', cls: 'chip-1k' },
    { value: 5000, label: '5K', cls: 'chip-5k' },
  ]

  // ── Deal a full round ─────────────────────────────────────────────

  const deal = useCallback(() => {
    if (betAmount <= 0 || betAmount > state.balance) return

    // Deduct bet
    dispatch({ type: 'SUBTRACT_BALANCE', amount: betAmount })

    // Reset visible counts
    setVisiblePlayerCards(0)
    setVisibleBankerCards(0)
    setWinnerSide(null)
    setResultMessage('')

    // Draw initial four cards (alternating: P1, B1, P2, B2)
    const p1 = drawCard()
    const b1 = drawCard()
    const p2 = drawCard()
    const b2 = drawCard()

    const pHand: Card[] = [p1, p2]
    const bHand: Card[] = [b1, b2]

    const pTotal = baccaratHandTotal(pHand)
    const bTotal = baccaratHandTotal(bHand)

    // Build the full deal sequence (including potential third cards)
    const steps: DealStep[] = [
      { target: 'player', card: p1, delay: animDelay(0) },
      { target: 'banker', card: b1, delay: animDelay(400) },
      { target: 'player', card: p2, delay: animDelay(800) },
      { target: 'banker', card: b2, delay: animDelay(1200) },
    ]

    let playerDrewThird = false
    let playerThirdValue: number | null = null

    // Check for naturals
    const isNatural = pTotal >= 8 || bTotal >= 8

    if (!isNatural) {
      // Player third card
      if (playerDrawsThird(pTotal)) {
        const p3 = drawCard()
        pHand.push(p3)
        playerDrewThird = true
        playerThirdValue = baccaratCardValue(p3)
        steps.push({ target: 'player', card: p3, delay: animDelay(1700) })
      }

      // Banker third card
      const bTotalNow = baccaratHandTotal(bHand)
      if (bankerDrawsThird(bTotalNow, playerDrewThird, playerThirdValue)) {
        const b3 = drawCard()
        bHand.push(b3)
        steps.push({ target: 'banker', card: b3, delay: animDelay(playerDrewThird ? 2200 : 1700) })
      }
    }

    // Set full hands (but they'll reveal via visible card counters)
    setPlayerHand(pHand)
    setBankerHand(bHand)
    setPhase('dealing')

    // Animate each card appearing
    const timeouts: ReturnType<typeof setTimeout>[] = []

    steps.forEach((step, idx) => {
      const t = setTimeout(() => {
        if (step.target === 'player') {
          setVisiblePlayerCards((prev) => prev + 1)
        } else {
          setVisibleBankerCards((prev) => prev + 1)
        }
      }, step.delay)
      timeouts.push(t)
    })

    // Final resolution after all cards dealt
    const finalDelay = steps[steps.length - 1].delay + animDelay(600)
    const resolveTimeout = setTimeout(() => {
      resolveRound(pHand, bHand)
    }, finalDelay)
    timeouts.push(resolveTimeout)

    // Store timeouts for cleanup
    timeoutsRef.current = timeouts
  }, [betAmount, state.balance, dispatch, drawCard])

  // Timeout refs for cleanup
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  // ── Resolve round ─────────────────────────────────────────────────

  const resolveRound = (pHand: Card[], bHand: Card[]) => {
    const pTotal = baccaratHandTotal(pHand)
    const bTotal = baccaratHandTotal(bHand)

    let winner: 'player' | 'banker' | 'tie'
    if (pTotal > bTotal) winner = 'player'
    else if (bTotal > pTotal) winner = 'banker'
    else winner = 'tie'

    setWinnerSide(winner)

    let payout = 0
    let msg = ''
    let cls: 'win' | 'lose' | 'push' = 'lose'

    if (winner === 'tie') {
      if (selectedBet === 'tie') {
        // Tie bet pays 8:1
        payout = betAmount + betAmount * 8
        msg = `Tie! You win ${payout.toLocaleString()} $MNKY (8:1)`
        cls = 'win'
      } else {
        // Push on tie for player/banker bets
        payout = betAmount
        msg = `Tie! Your ${selectedBet} bet is returned.`
        cls = 'push'
      }
    } else if (winner === selectedBet) {
      if (selectedBet === 'banker') {
        // Banker pays 0.95:1 (5% commission)
        const winnings = Math.floor(betAmount * 0.95)
        payout = betAmount + winnings
        msg = `Banker wins! You win ${winnings.toLocaleString()} $MNKY (5% commission)`
      } else {
        // Player pays 1:1
        payout = betAmount * 2
        msg = `Player wins! You win ${betAmount.toLocaleString()} $MNKY`
      }
      cls = 'win'
    } else {
      msg = `${winner.charAt(0).toUpperCase() + winner.slice(1)} wins with ${winner === 'player' ? baccaratHandTotal(pHand) : baccaratHandTotal(bHand)}. You lose ${betAmount.toLocaleString()} $MNKY.`
      cls = 'lose'
    }

    if (payout > 0) {
      dispatch({ type: 'ADD_BALANCE', amount: payout })
    }

    setResultMessage(msg)
    setResultClass(cls)
    setPhase('result')

    setStats((prev) => ({
      played: prev.played + 1,
      won: cls === 'win' ? prev.won + 1 : prev.won,
      lost: cls === 'lose' ? prev.lost + 1 : prev.lost,
    }))
  }

  // ── New round ─────────────────────────────────────────────────────

  const newRound = () => {
    setPhase('betting')
    setPlayerHand([])
    setBankerHand([])
    setVisiblePlayerCards(0)
    setVisibleBankerCards(0)
    setResultMessage('')
    setWinnerSide(null)
  }

  // ── Render card ───────────────────────────────────────────────────

  const renderCard = (card: Card, index: number, visible: boolean) => {
    if (!visible) return null

    const redClass = isRed(card.suit) ? 'red' : ''

    return (
      <span
        key={`${card.rank}${card.suit}-${index}`}
        className={`card-display face-up ${redClass}`}
        style={{
          animation: 'fadeIn 0.3s ease',
        }}
      >
        {card.rank}
        {card.suit}
      </span>
    )
  }

  // ── Render hand section ───────────────────────────────────────────

  const renderHand = (
    label: string,
    hand: Card[],
    visibleCount: number,
    isWinner: boolean,
    testId: string,
  ) => {
    const total = baccaratHandTotal(hand.slice(0, visibleCount))
    const showTotal = visibleCount > 0

    return (
      <div className={`baccarat-hand${isWinner ? ' winner' : ''}`} data-testid={testId} data-total={total}>
        <h3>{label}</h3>
        <div style={{ minHeight: 108, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          {hand.map((card, i) => renderCard(card, i, i < visibleCount))}
          {visibleCount === 0 && (
            <span className="card-display face-down">&nbsp;</span>
          )}
        </div>
        {showTotal && (
          <div className="baccarat-total" style={{ color: 'var(--accent)' }}>
            {total}
          </div>
        )}
      </div>
    )
  }

  // ── Bet options config ────────────────────────────────────────────

  const betOptions: { type: BetType; label: string; odds: string }[] = [
    { type: 'player', label: 'Player', odds: 'Pays 1:1 (Edge 1.24%)' },
    { type: 'tie', label: 'Tie', odds: 'Pays 8:1 (Edge 14.36%)' },
    { type: 'banker', label: 'Banker', odds: 'Pays 0.95:1 (Edge 1.06%)' },
  ]

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="game-container" data-testid="game-container" data-game="baccarat">
      <div data-testid="game-state" data-game="baccarat" data-phase={phase} data-balance={state.balance} data-bet={betAmount} data-bet-type={selectedBet} data-player-total={baccaratHandTotal(playerHand)} data-banker-total={baccaratHandTotal(bankerHand)} data-winner={winnerSide || ''} style={{display:'none'}} />
      {/* Header */}
      <div className="game-header">
        <h1>Baccarat</h1>
        <div className="game-controls">
          <Link to="/" className="btn btn-sm">
            Back to Lobby
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="game-table">
        {/* Hands */}
        <div className="baccarat-hands">
          {renderHand(
            'Player',
            playerHand,
            visiblePlayerCards,
            winnerSide === 'player',
            'player-hand',
          )}
          {renderHand(
            'Banker',
            bankerHand,
            visibleBankerCards,
            winnerSide === 'banker',
            'banker-hand',
          )}
        </div>

        {/* Result message */}
        {phase === 'result' && resultMessage && (
          <div className={`game-result ${resultClass}`} data-testid="game-result" aria-live="polite">{resultMessage}</div>
        )}

        {/* Bet selection */}
        {phase === 'betting' && (
          <>
            <div className="baccarat-bets">
              {betOptions.map((opt) => (
                <button
                  key={opt.type}
                  className={`baccarat-bet-option${selectedBet === opt.type ? ' selected' : ''}`}
                  onClick={() => setSelectedBet(opt.type)}
                  data-testid={`baccarat-bet-${opt.type}`}
                  aria-label={`Bet on ${opt.label}`}
                  aria-pressed={selectedBet === opt.type}
                >
                  <span className="baccarat-bet-label">{opt.label}</span>
                  <span className="baccarat-bet-odds">{opt.odds}</span>
                </button>
              ))}
            </div>

            {/* Bet amount */}
            <div className="bet-area">
              <input
                type="number"
                className="bet-input"
                value={betAmount}
                min={1}
                max={state.balance}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0
                  setBetAmount(Math.max(0, Math.min(v, state.balance)))
                }}
                data-testid="baccarat-bet-input"
                aria-label="Bet amount"
              />
            </div>

            <div className="chip-buttons">
              {chipValues.map((chip) => (
                <button
                  key={chip.value}
                  className={`chip ${chip.cls}`}
                  onClick={() =>
                    setBetAmount((prev) =>
                      Math.min(prev + chip.value, state.balance),
                    )
                  }
                  disabled={state.balance < chip.value}
                  data-testid={`chip-${chip.value}`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="game-actions">
          {phase === 'betting' && (
            <button
              className="btn btn-primary"
              disabled={betAmount <= 0 || betAmount > state.balance}
              onClick={deal}
              data-testid="baccarat-deal"
            >
              Deal
            </button>
          )}
          {phase === 'dealing' && (
            <button className="btn" disabled>
              Dealing...
            </button>
          )}
          {phase === 'result' && (
            <>
              <button className="btn btn-primary" onClick={newRound} data-testid="baccarat-new-round">
                New Round
              </button>
              <button
                className="btn"
                onClick={() => {
                  setBetAmount((prev) => Math.min(prev * 2, state.balance))
                  newRound()
                }}
                disabled={betAmount * 2 > state.balance}
                data-testid="baccarat-double-rebet"
              >
                Double & Rebet
              </button>
            </>
          )}
        </div>
      </div>

      {/* Game info bar */}
      <div className="game-info">
        <span>
          Balance:{' '}
          <strong style={{ color: 'var(--green)' }}>
            {state.balance.toLocaleString()} $MNKY
          </strong>
        </span>
        <span>
          Bet: <strong>{betAmount.toLocaleString()}</strong> on{' '}
          <strong style={{ textTransform: 'capitalize' }}>{selectedBet}</strong>
        </span>
        <span>
          W/L: {stats.won}/{stats.lost} ({stats.played} rounds)
        </span>
      </div>

      {/* Rules reference */}
      <div
        className="game-info"
        style={{ marginTop: 8, flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}
      >
        <strong style={{ fontSize: 13, letterSpacing: 1 }}>PUNTO BANCO RULES</strong>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div>Cards: A=1, 2-9 face value, 10/J/Q/K=0. Hand value = sum mod 10.</div>
          <div>Natural: 8 or 9 on initial two cards -- both stand.</div>
          <div>Player draws third card on 0-5, stands on 6-7.</div>
          <div>Banker third card depends on own total and player's third card value.</div>
          <div>8-deck shoe. Banker bet has 5% commission on wins.</div>
        </div>
      </div>
    </div>
  )
}
