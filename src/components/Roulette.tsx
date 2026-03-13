import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useGame, animDelay } from '../store'

// ── Constants ──────────────────────────────────────────────────────────────────

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

// All 38 pockets on an American roulette wheel (includes 0 and 00)
const WHEEL_NUMBERS: string[] = [
  '0', '00',
  ...Array.from({ length: 36 }, (_, i) => String(i + 1)),
]

type BetType =
  | 'straight'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high'
  | 'dozen1'
  | 'dozen2'
  | 'dozen3'
  | 'col1'
  | 'col2'
  | 'col3'

interface PlacedBet {
  id: number
  type: BetType
  numbers: string[] // the pocket values this bet covers
  label: string
  amount: number
  payout: number // multiplier (e.g. 35 for straight-up, 1 for even-money)
}

type GamePhase = 'betting' | 'spinning' | 'result'

const CHIP_VALUES = [
  { value: 5, css: 'chip-5', label: '5' },
  { value: 25, css: 'chip-25', label: '25' },
  { value: 100, css: 'chip-100', label: '100' },
  { value: 500, css: 'chip-500', label: '500' },
  { value: 1000, css: 'chip-1k', label: '1K' },
  { value: 5000, css: 'chip-5k', label: '5K' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function getColor(num: string): 'red' | 'black' | 'green' {
  if (num === '0' || num === '00') return 'green'
  const n = Number(num)
  if (RED_NUMBERS.includes(n)) return 'red'
  if (BLACK_NUMBERS.includes(n)) return 'black'
  return 'green'
}

function colorCssClass(num: string): string {
  const c = getColor(num)
  if (c === 'red') return 'rn-red'
  if (c === 'black') return 'rn-black'
  return 'rn-green'
}

function resultColorClass(num: string): string {
  const c = getColor(num)
  if (c === 'red') return 'r-red'
  if (c === 'black') return 'r-black'
  return 'r-green'
}

/** Numbers that belong to each column (reading the standard roulette layout). */
function columnNumbers(col: 1 | 2 | 3): string[] {
  const nums: string[] = []
  for (let row = 0; row < 12; row++) {
    nums.push(String(row * 3 + col))
  }
  return nums
}

/** Numbers in a dozen group. */
function dozenNumbers(group: 1 | 2 | 3): string[] {
  const start = (group - 1) * 12 + 1
  return Array.from({ length: 12 }, (_, i) => String(start + i))
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Roulette() {
  const { state, dispatch } = useGame()

  const [phase, setPhase] = useState<GamePhase>('betting')
  const [bets, setBets] = useState<PlacedBet[]>([])
  const [chipValue, setChipValue] = useState(25)
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set())
  const [activeBetType, setActiveBetType] = useState<BetType>('straight')
  const [result, setResult] = useState<string | null>(null)
  const [winnings, setWinnings] = useState(0)
  const [spinDisplay, setSpinDisplay] = useState<string | null>(null)
  const [betIdCounter, setBetIdCounter] = useState(0)

  const totalBet = bets.reduce((sum, b) => sum + b.amount, 0)

  // ── Bet placement ──────────────────────────────────────────────────────────

  const toggleNumber = useCallback(
    (num: string) => {
      if (phase !== 'betting') return
      setSelectedNumbers(prev => {
        const next = new Set(prev)
        if (next.has(num)) next.delete(num)
        else next.add(num)
        return next
      })
      // When clicking a number, auto-switch to straight bet type
      setActiveBetType('straight')
    },
    [phase],
  )

  const placeBet = useCallback(() => {
    if (phase !== 'betting') return

    let numbers: string[] = []
    let label = ''
    let payout = 0

    switch (activeBetType) {
      case 'straight': {
        if (selectedNumbers.size === 0) return
        // Place a separate straight bet on each selected number
        const newBets: PlacedBet[] = []
        let counter = betIdCounter
        let costTotal = 0
        for (const num of selectedNumbers) {
          if (chipValue > state.balance - costTotal) break
          counter++
          costTotal += chipValue
          newBets.push({
            id: counter,
            type: 'straight',
            numbers: [num],
            label: `Straight ${num}`,
            amount: chipValue,
            payout: 35,
          })
        }
        if (newBets.length === 0) return
        dispatch({ type: 'SUBTRACT_BALANCE', amount: costTotal })
        setBets(prev => [...prev, ...newBets])
        setBetIdCounter(counter)
        setSelectedNumbers(new Set())
        return
      }
      case 'red':
        numbers = RED_NUMBERS.map(String)
        label = 'Red'
        payout = 1
        break
      case 'black':
        numbers = BLACK_NUMBERS.map(String)
        label = 'Black'
        payout = 1
        break
      case 'odd':
        numbers = Array.from({ length: 36 }, (_, i) => i + 1)
          .filter(n => n % 2 === 1)
          .map(String)
        label = 'Odd'
        payout = 1
        break
      case 'even':
        numbers = Array.from({ length: 36 }, (_, i) => i + 1)
          .filter(n => n % 2 === 0)
          .map(String)
        label = 'Even'
        payout = 1
        break
      case 'low':
        numbers = Array.from({ length: 18 }, (_, i) => String(i + 1))
        label = '1-18'
        payout = 1
        break
      case 'high':
        numbers = Array.from({ length: 18 }, (_, i) => String(i + 19))
        label = '19-36'
        payout = 1
        break
      case 'dozen1':
        numbers = dozenNumbers(1)
        label = '1st Dozen'
        payout = 2
        break
      case 'dozen2':
        numbers = dozenNumbers(2)
        label = '2nd Dozen'
        payout = 2
        break
      case 'dozen3':
        numbers = dozenNumbers(3)
        label = '3rd Dozen'
        payout = 2
        break
      case 'col1':
        numbers = columnNumbers(1)
        label = 'Column 1'
        payout = 2
        break
      case 'col2':
        numbers = columnNumbers(2)
        label = 'Column 2'
        payout = 2
        break
      case 'col3':
        numbers = columnNumbers(3)
        label = 'Column 3'
        payout = 2
        break
    }

    if (chipValue > state.balance) return
    dispatch({ type: 'SUBTRACT_BALANCE', amount: chipValue })
    const id = betIdCounter + 1
    setBetIdCounter(id)
    setBets(prev => [
      ...prev,
      { id, type: activeBetType, numbers, label, amount: chipValue, payout },
    ])
  }, [phase, activeBetType, selectedNumbers, chipValue, state.balance, dispatch, betIdCounter])

  const removeBet = useCallback(
    (id: number) => {
      if (phase !== 'betting') return
      setBets(prev => {
        const bet = prev.find(b => b.id === id)
        if (bet) dispatch({ type: 'ADD_BALANCE', amount: bet.amount })
        return prev.filter(b => b.id !== id)
      })
    },
    [phase, dispatch],
  )

  const clearAllBets = useCallback(() => {
    if (phase !== 'betting') return
    const refund = bets.reduce((sum, b) => sum + b.amount, 0)
    if (refund > 0) dispatch({ type: 'ADD_BALANCE', amount: refund })
    setBets([])
    setSelectedNumbers(new Set())
  }, [phase, bets, dispatch])

  // ── Spin ───────────────────────────────────────────────────────────────────

  const spin = useCallback(() => {
    if (phase !== 'betting' || bets.length === 0) return
    setPhase('spinning')
    setResult(null)
    setWinnings(0)

    // Animated spin: rapidly cycle through random numbers for ~2s
    let ticks = 0
    const maxTicks = 30
    const interval = setInterval(() => {
      ticks++
      const rand = WHEEL_NUMBERS[Math.floor(Math.random() * WHEEL_NUMBERS.length)]
      setSpinDisplay(rand)
      if (ticks >= maxTicks) {
        clearInterval(interval)
        // Final result
        const finalResult = WHEEL_NUMBERS[Math.floor(Math.random() * WHEEL_NUMBERS.length)]
        setSpinDisplay(finalResult)
        setResult(finalResult)

        // Evaluate bets
        let totalWin = 0
        for (const bet of bets) {
          if (bet.numbers.includes(finalResult)) {
            // Win: return original bet + payout * bet
            totalWin += bet.amount + bet.amount * bet.payout
          }
        }
        setWinnings(totalWin)
        if (totalWin > 0) {
          dispatch({ type: 'ADD_BALANCE', amount: totalWin })
        }
        setPhase('result')
      }
    }, animDelay(70))
  }, [phase, bets, dispatch])

  // Reset to allow another round
  const newRound = useCallback(() => {
    setPhase('betting')
    setBets([])
    setResult(null)
    setWinnings(0)
    setSpinDisplay(null)
    setSelectedNumbers(new Set())
  }, [])

  // ── Board layout: standard American roulette table ─────────────────────────
  // Row layout: 3 rows x 12 columns for numbers 1-36
  // Top row (col left to right): 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
  // Mid row: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
  // Bot row: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34

  const boardRows = [
    Array.from({ length: 12 }, (_, i) => String(i * 3 + 3)),
    Array.from({ length: 12 }, (_, i) => String(i * 3 + 2)),
    Array.from({ length: 12 }, (_, i) => String(i * 3 + 1)),
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="game-container" data-testid="game-container" data-game="roulette">
      <div data-testid="game-state" data-game="roulette" data-phase={phase} data-balance={state.balance} data-result-number={result ?? ''} data-total-bet={bets.reduce((s,b) => s + b.amount, 0)} data-winnings={winnings} style={{display:'none'}} />
      {/* Header */}
      <div className="game-header">
        <h1>Roulette</h1>
        <div className="game-controls">
          <Link to="/" className="btn btn-sm">
            Back to Lobby
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="game-table">
        {/* Spin result area */}
        <div className="roulette-wheel-container">
          {phase === 'spinning' && spinDisplay !== null && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                Spinning...
              </div>
              <div className={`roulette-result ${resultColorClass(spinDisplay)}`} style={{ animation: 'fadeIn 0.08s' }}>
                {spinDisplay}
              </div>
            </>
          )}
          {phase === 'result' && result !== null && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                Result
              </div>
              <div className={`roulette-result ${resultColorClass(result)}`} data-testid="roulette-result-number">
                {result}
              </div>
            </>
          )}
          {phase === 'betting' && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Place your bets, then spin the wheel.
            </div>
          )}
        </div>

        {/* Result message */}
        {phase === 'result' && (
          <div className={`game-result ${winnings > 0 ? 'win' : 'lose'}`} data-testid="game-result" aria-live="polite">
            {winnings > 0
              ? `You won ${winnings.toLocaleString()} $MNKY!`
              : `No luck this time. Lost ${totalBet.toLocaleString()} $MNKY.`}
          </div>
        )}

        {/* Roulette board */}
        {phase === 'betting' && (
          <>
            <div className="roulette-board">
              {/* 0 and 00 span the left side */}
              <button
                className={`roulette-num rn-green ${selectedNumbers.has('0') ? 'selected' : ''}`}
                style={{ gridColumn: '1', gridRow: '1 / span 2' }}
                data-testid="roulette-number-0"
                role="button"
                onClick={() => toggleNumber('0')}
              >
                0
              </button>
              <button
                className={`roulette-num rn-green ${selectedNumbers.has('00') ? 'selected' : ''}`}
                style={{ gridColumn: '1', gridRow: '2 / span 2' }}
                data-testid="roulette-number-00"
                role="button"
                onClick={() => toggleNumber('00')}
              >
                00
              </button>

              {/* Number grid: 3 rows, 12 columns (columns 2-13) */}
              {boardRows.map((row, rowIdx) =>
                row.map((num, colIdx) => (
                  <button
                    key={num}
                    className={`roulette-num ${colorCssClass(num)} ${selectedNumbers.has(num) ? 'selected' : ''}`}
                    style={{ gridColumn: colIdx + 2, gridRow: rowIdx + 1 }}
                    data-testid={`roulette-number-${num}`}
                    role="button"
                    onClick={() => toggleNumber(num)}
                  >
                    {num}
                  </button>
                )),
              )}
            </div>

            {/* Outside bet buttons */}
            <div className="roulette-bets">
              <button
                className={`roulette-bet-btn ${activeBetType === 'red' ? 'active' : ''}`}
                data-testid="roulette-bet-red"
                onClick={() => setActiveBetType('red')}
              >
                Red (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'black' ? 'active' : ''}`}
                data-testid="roulette-bet-black"
                onClick={() => setActiveBetType('black')}
              >
                Black (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'odd' ? 'active' : ''}`}
                data-testid="roulette-bet-odd"
                onClick={() => setActiveBetType('odd')}
              >
                Odd (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'even' ? 'active' : ''}`}
                data-testid="roulette-bet-even"
                onClick={() => setActiveBetType('even')}
              >
                Even (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'low' ? 'active' : ''}`}
                data-testid="roulette-bet-low"
                onClick={() => setActiveBetType('low')}
              >
                1-18 (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'high' ? 'active' : ''}`}
                data-testid="roulette-bet-high"
                onClick={() => setActiveBetType('high')}
              >
                19-36 (1:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'dozen1' ? 'active' : ''}`}
                data-testid="roulette-bet-dozen1"
                onClick={() => setActiveBetType('dozen1')}
              >
                1st 12 (2:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'dozen2' ? 'active' : ''}`}
                data-testid="roulette-bet-dozen2"
                onClick={() => setActiveBetType('dozen2')}
              >
                2nd 12 (2:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'dozen3' ? 'active' : ''}`}
                data-testid="roulette-bet-dozen3"
                onClick={() => setActiveBetType('dozen3')}
              >
                3rd 12 (2:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'col1' ? 'active' : ''}`}
                data-testid="roulette-bet-col1"
                onClick={() => setActiveBetType('col1')}
              >
                Col 1 (2:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'col2' ? 'active' : ''}`}
                data-testid="roulette-bet-col2"
                onClick={() => setActiveBetType('col2')}
              >
                Col 2 (2:1)
              </button>
              <button
                className={`roulette-bet-btn ${activeBetType === 'col3' ? 'active' : ''}`}
                data-testid="roulette-bet-col3"
                onClick={() => setActiveBetType('col3')}
              >
                Col 3 (2:1)
              </button>
            </div>

            {/* Chip selection and bet amount */}
            <div className="bet-area">
              <div className="chip-buttons">
                {CHIP_VALUES.map(c => (
                  <button
                    key={c.value}
                    className={`chip ${c.css}`}
                    data-testid={`chip-${c.value}`}
                    style={chipValue === c.value ? { transform: 'scale(1.2)', boxShadow: '0 0 12px rgba(0,240,255,0.4)' } : undefined}
                    onClick={() => setChipValue(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Place bet button */}
            <div className="game-actions">
              <button
                className="btn btn-primary"
                data-testid="roulette-place-bet"
                disabled={
                  activeBetType === 'straight'
                    ? selectedNumbers.size === 0 || chipValue > state.balance
                    : chipValue > state.balance
                }
                onClick={placeBet}
              >
                Place Bet ({chipValue.toLocaleString()} $MNKY)
              </button>
              {bets.length > 0 && (
                <button className="btn btn-danger btn-sm" data-testid="roulette-clear-all" onClick={clearAllBets}>
                  Clear All
                </button>
              )}
            </div>
          </>
        )}

        {/* Active bets list */}
        {bets.length > 0 && (
          <div style={{ margin: '20px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
              Active Bets ({bets.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {bets.map(bet => (
                <div
                  key={bet.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{bet.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--green)' }}>
                    {bet.amount.toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>({bet.payout}:1)</span>
                  {phase === 'betting' && (
                    <button
                      onClick={() => removeBet(bet.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--red)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 14,
                        lineHeight: 1,
                        padding: '0 2px',
                      }}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spin / New Round buttons */}
        <div className="game-actions">
          {phase === 'betting' && bets.length > 0 && (
            <button className="btn btn-primary" data-testid="roulette-spin" onClick={spin}>
              Spin the Wheel
            </button>
          )}
          {phase === 'result' && (
            <button className="btn btn-primary" data-testid="roulette-new-round" onClick={newRound}>
              New Round
            </button>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="game-info">
        <div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>Balance:</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--green)' }}>
            {state.balance.toLocaleString()} $MNKY
          </span>
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>Total Bet:</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--accent)' }}>
            {totalBet.toLocaleString()} $MNKY
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          House Edge 5.26% | American Roulette (0 & 00)
        </div>
      </div>
    </div>
  )
}
