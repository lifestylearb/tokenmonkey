import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGame, animDelay } from '../store'
import { SlotSymbol } from '../types'

// ── Symbol definitions ──────────────────────────────────────────────
const SYMBOLS: SlotSymbol[] = [
  { id: 'monkey',  emoji: '🐵', name: 'Monkey',  multiplier: 50 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', multiplier: 25 },
  { id: 'cherry',  emoji: '🍒', name: 'Cherry',  multiplier: 10 },
  { id: 'bell',    emoji: '🔔', name: 'Bell',    multiplier: 8 },
  { id: 'lemon',   emoji: '🍋', name: 'Lemon',   multiplier: 5 },
  { id: 'orange',  emoji: '🍊', name: 'Orange',  multiplier: 3 },
  { id: 'star',    emoji: '⭐', name: 'Star',    multiplier: 2 },
  { id: 'wild',    emoji: '🃏', name: 'Wild',    multiplier: 0 },
]

const WILD = SYMBOLS[SYMBOLS.length - 1]
const NUM_REELS = 5

// ── Weighted symbol table ───────────────────────────────────────────
// Weights are tuned to produce an overall RTP close to 95%.
// Lower weight = rarer symbol.  The wild appears infrequently enough
// to keep the house edge near 5%.
const WEIGHTED_SYMBOLS: { symbol: SlotSymbol; weight: number }[] = [
  { symbol: SYMBOLS[0], weight: 2 },   // Monkey   (jackpot)
  { symbol: SYMBOLS[1], weight: 4 },   // Diamond
  { symbol: SYMBOLS[2], weight: 8 },   // Cherry
  { symbol: SYMBOLS[3], weight: 10 },  // Bell
  { symbol: SYMBOLS[4], weight: 16 },  // Lemon
  { symbol: SYMBOLS[5], weight: 22 },  // Orange
  { symbol: SYMBOLS[6], weight: 28 },  // Star
  { symbol: SYMBOLS[7], weight: 6 },   // Wild
]

const TOTAL_WEIGHT = WEIGHTED_SYMBOLS.reduce((s, w) => s + w.weight, 0)

function pickRandomSymbol(): SlotSymbol {
  let r = Math.random() * TOTAL_WEIGHT
  for (const entry of WEIGHTED_SYMBOLS) {
    r -= entry.weight
    if (r <= 0) return entry.symbol
  }
  return SYMBOLS[6] // fallback: star
}

// ── Evaluate a single pay-line (5 reels) ────────────────────────────
// Returns the best matching count and the non-wild symbol that matched.
// Wilds substitute for any symbol.  A line of all wilds counts as 5-star.
function evaluateLine(reels: SlotSymbol[]): { count: number; symbol: SlotSymbol } {
  // Try each non-wild symbol as the "target" and see how many consecutive
  // matches from the left we can get (wilds count as matches).
  let bestCount = 0
  let bestSymbol = SYMBOLS[6] // star as default

  for (const sym of SYMBOLS) {
    if (sym.id === 'wild') continue
    let consecutive = 0
    for (let i = 0; i < NUM_REELS; i++) {
      if (reels[i].id === sym.id || reels[i].id === 'wild') {
        consecutive++
      } else {
        break
      }
    }
    if (consecutive > bestCount || (consecutive === bestCount && sym.multiplier > bestSymbol.multiplier)) {
      bestCount = consecutive
      bestSymbol = sym
    }
  }

  return { count: bestCount, symbol: bestSymbol }
}

// ── Payout calculation ──────────────────────────────────────────────
// 5-of-a-kind  ->  full multiplier
// 4-of-a-kind  ->  half multiplier
// 3-of-a-kind  ->  quarter multiplier
// Less than 3  ->  0
function calculatePayout(bet: number, reels: SlotSymbol[]): { payout: number; count: number; symbol: SlotSymbol } {
  const { count, symbol } = evaluateLine(reels)

  if (count >= 5) {
    return { payout: bet * symbol.multiplier, count: 5, symbol }
  }
  if (count === 4) {
    return { payout: bet * Math.floor(symbol.multiplier / 2), count: 4, symbol }
  }
  if (count === 3) {
    return { payout: bet * Math.floor(symbol.multiplier / 4), count: 3, symbol }
  }

  return { payout: 0, count, symbol }
}

// ── Component ───────────────────────────────────────────────────────
export default function Slots() {
  const { state, dispatch } = useGame()

  // Game state
  const [bet, setBet] = useState(10)
  const [reels, setReels] = useState<SlotSymbol[]>(() =>
    Array.from({ length: NUM_REELS }, () => pickRandomSymbol()),
  )
  const [spinning, setSpinning] = useState<boolean[]>(Array(NUM_REELS).fill(false))
  const [result, setResult] = useState<{ payout: number; count: number; symbol: SlotSymbol } | null>(null)
  const [showPaytable, setShowPaytable] = useState(false)
  const [autoSpin, setAutoSpin] = useState(false)
  const [totalSpins, setTotalSpins] = useState(0)
  const [totalWon, setTotalWon] = useState(0)

  const autoSpinRef = useRef(autoSpin)
  const spinningRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    autoSpinRef.current = autoSpin
  }, [autoSpin])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout)
    }
  }, [])

  // ── Spin ────────────────────────────────────────────────────────
  const spin = useCallback(() => {
    if (spinningRef.current) return
    if (bet <= 0 || bet > state.balance) return

    spinningRef.current = true
    setResult(null)

    // Deduct bet
    dispatch({ type: 'SUBTRACT_BALANCE', amount: bet })

    // Decide final symbols up front
    const finalReels = Array.from({ length: NUM_REELS }, () => pickRandomSymbol())

    // All reels start spinning
    setSpinning(Array(NUM_REELS).fill(true))

    // Rapidly cycle display symbols while spinning
    const cycleTimers: ReturnType<typeof setTimeout>[] = []
    const cycleInterval = animDelay(80)

    for (let r = 0; r < NUM_REELS; r++) {
      const stopDelay = animDelay(600) + r * animDelay(400) // reels stop one by one, left to right
      const numCycles = Math.floor(stopDelay / cycleInterval)

      for (let c = 0; c < numCycles; c++) {
        const timer = setTimeout(() => {
          setReels(prev => {
            const next = [...prev]
            next[r] = pickRandomSymbol()
            return next
          })
        }, c * cycleInterval)
        cycleTimers.push(timer)
      }

      // Stop this reel: set final symbol and clear spinning state
      const stopTimer = setTimeout(() => {
        setReels(prev => {
          const next = [...prev]
          next[r] = finalReels[r]
          return next
        })
        setSpinning(prev => {
          const next = [...prev]
          next[r] = false
          return next
        })
      }, stopDelay)
      cycleTimers.push(stopTimer)
    }

    timersRef.current = cycleTimers

    // After all reels stop, evaluate result
    const totalDuration = animDelay(600) + (NUM_REELS - 1) * animDelay(400) + animDelay(100)
    const evalTimer = setTimeout(() => {
      const outcome = calculatePayout(bet, finalReels)
      setResult(outcome)
      setTotalSpins(s => s + 1)

      if (outcome.payout > 0) {
        dispatch({ type: 'ADD_BALANCE', amount: outcome.payout })
        setTotalWon(w => w + outcome.payout)
      }

      spinningRef.current = false

      // Auto-spin continuation
      if (autoSpinRef.current && state.balance - bet + (outcome.payout) >= bet) {
        const nextTimer = setTimeout(() => {
          if (autoSpinRef.current) spin()
        }, animDelay(800))
        timersRef.current.push(nextTimer)
      } else if (autoSpinRef.current) {
        setAutoSpin(false)
      }
    }, totalDuration)
    cycleTimers.push(evalTimer)
  }, [bet, state.balance, dispatch])

  // Trigger auto-spin start
  useEffect(() => {
    if (autoSpin && !spinningRef.current) {
      spin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpin])

  // ── Chip click ──────────────────────────────────────────────────
  const addChip = (amount: number) => {
    if (spinningRef.current) return
    setBet(prev => Math.min(prev + amount, state.balance))
  }

  const anySpinning = spinning.some(Boolean)

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="game-container" data-testid="game-container" data-game="slots">
      <div data-testid="game-state" data-game="slots" data-phase={anySpinning ? 'spinning' : 'idle'} data-balance={state.balance} data-bet={bet} data-last-win={result?.payout ?? 0} style={{display:'none'}} />
      {/* Header */}
      <div className="game-header">
        <h1>
          <span>🍒</span> Slot Machine
        </h1>
        <Link to="/" className="btn btn-sm">Back to Lobby</Link>
      </div>

      {/* Main game area */}
      <div className="game-table">
        {/* Reels */}
        <div className="slot-machine">
          {reels.map((sym, i) => (
            <div key={i} className={`slot-reel${spinning[i] ? ' spinning' : ''}`} data-testid={`reel-${i}`} data-symbol={sym.emoji}>
              {sym.emoji}
            </div>
          ))}
        </div>

        {/* Result message */}
        <div data-testid="game-result" aria-live="polite">
          {result && !anySpinning && (
            result.payout > 0 ? (
              <div className="game-result win">
                {result.count >= 5 ? 'JACKPOT! ' : ''}
                {result.count}x {result.symbol.emoji} {result.symbol.name}
                {' '}&mdash;{' '}
                Won {result.payout.toLocaleString()} credits!
              </div>
            ) : (
              <div className="game-result lose">
                No match &mdash; try again!
              </div>
            )
          )}
        </div>

        {/* Bet area */}
        <div className="bet-area">
          <input
            type="number"
            className="bet-input"
            data-testid="slots-bet-input"
            aria-label="Bet amount"
            value={bet}
            min={1}
            max={state.balance}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v >= 0) setBet(v)
            }}
            disabled={anySpinning}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>credits</span>
        </div>

        <div className="chip-buttons">
          <button className="chip chip-5" data-testid="chip-5" onClick={() => addChip(5)} disabled={anySpinning}>5</button>
          <button className="chip chip-25" data-testid="chip-25" onClick={() => addChip(25)} disabled={anySpinning}>25</button>
          <button className="chip chip-100" data-testid="chip-100" onClick={() => addChip(100)} disabled={anySpinning}>100</button>
          <button className="chip chip-500" data-testid="chip-500" onClick={() => addChip(500)} disabled={anySpinning}>500</button>
          <button className="chip chip-1k" data-testid="chip-1000" onClick={() => addChip(1000)} disabled={anySpinning}>1K</button>
          <button className="chip chip-5k" data-testid="chip-5000" onClick={() => addChip(5000)} disabled={anySpinning}>5K</button>
        </div>

        {/* Action buttons */}
        <div className="game-actions">
          <button
            className="btn btn-primary"
            data-testid="slots-spin"
            disabled={anySpinning || bet <= 0 || bet > state.balance}
            onClick={spin}
          >
            {anySpinning ? 'Spinning...' : 'Spin'}
          </button>
          <button
            className={`btn ${autoSpin ? 'btn-danger' : 'btn-success'}`}
            data-testid="slots-auto-spin"
            onClick={() => setAutoSpin(prev => !prev)}
            disabled={!autoSpin && (bet <= 0 || bet > state.balance)}
          >
            {autoSpin ? 'Stop Auto' : 'Auto Spin'}
          </button>
          <button
            className="btn btn-sm"
            data-testid="slots-half"
            onClick={() => setBet(Math.floor(state.balance / 2))}
            disabled={anySpinning}
          >
            Half
          </button>
          <button
            className="btn btn-sm"
            data-testid="slots-max"
            onClick={() => setBet(state.balance)}
            disabled={anySpinning}
          >
            Max
          </button>
          <button
            className="btn btn-sm"
            data-testid="slots-paytable-toggle"
            onClick={() => setShowPaytable(p => !p)}
          >
            {showPaytable ? 'Hide Paytable' : 'Paytable'}
          </button>
        </div>
      </div>

      {/* Session info */}
      <div className="game-info">
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>BALANCE </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--green)', fontWeight: 600 }}>
            {state.balance.toLocaleString()} credits
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>SPINS </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            {totalSpins}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>WON </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--green)', fontWeight: 600 }}>
            {totalWon.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Paytable */}
      {showPaytable && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ textAlign: 'center', marginBottom: 12, fontSize: 16, letterSpacing: 1 }}>
            PAYTABLE
          </h3>
          <div className="slot-paylines">
            {SYMBOLS.filter(s => s.id !== 'wild').map(sym => (
              <div className="slot-payline" key={sym.id}>
                <span>{sym.emoji} {sym.name}</span>
                <span className="slot-payline-mult">
                  5x={sym.multiplier}x &middot; 4x={Math.floor(sym.multiplier / 2)}x &middot; 3x={Math.floor(sym.multiplier / 4)}x
                </span>
              </div>
            ))}
            <div className="slot-payline">
              <span>{WILD.emoji} Wild</span>
              <span className="slot-payline-mult">Substitutes for any symbol</span>
            </div>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
            Matches are counted left-to-right from reel 1. 3+ consecutive matching symbols (or wilds) pay.
            <br />
            RTP: ~95% &middot; House Edge: ~5%
          </p>
        </div>
      )}
    </div>
  )
}
