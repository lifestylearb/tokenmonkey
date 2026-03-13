import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGame, animDelay } from '../store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BetType = 'pass' | 'dontPass' | 'come' | 'dontCome' | 'field' | 'any7'

type GamePhase = 'betting' | 'point' | 'rolling' | 'result'

interface BetOption {
  type: BetType
  name: string
  edge: string
  description: string
  /** Available during come-out roll only */
  comeOut: boolean
  /** Available during point phase only */
  pointPhase: boolean
}

interface ActiveBet {
  type: BetType
  amount: number
}

/** Come / Don't Come bets that have their own point established */
interface ComeBet {
  type: 'come' | 'dontCome'
  amount: number
  point: number
}

interface RollResult {
  dice: [number, number]
  total: number
}

interface BetSettlement {
  bet: BetType | string
  amount: number
  payout: number
  outcome: 'win' | 'lose' | 'push'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DICE_EMOJI: Record<number, string> = {
  1: '\u2680', // ⚀
  2: '\u2681', // ⚁
  3: '\u2682', // ⚂
  4: '\u2683', // ⚃
  5: '\u2684', // ⚄
  6: '\u2685', // ⚅
}

const BET_OPTIONS: BetOption[] = [
  {
    type: 'pass',
    name: 'Pass Line',
    edge: '1.41%',
    description: 'Win on 7/11 come-out, lose on 2/3/12. Point must repeat before 7.',
    comeOut: true,
    pointPhase: false,
  },
  {
    type: 'dontPass',
    name: "Don't Pass",
    edge: '1.36%',
    description: 'Lose on 7/11 come-out, win on 2/3 (12 push). 7 before point wins.',
    comeOut: true,
    pointPhase: false,
  },
  {
    type: 'come',
    name: 'Come',
    edge: '1.41%',
    description: 'Like Pass Line but placed after point is set.',
    comeOut: false,
    pointPhase: true,
  },
  {
    type: 'dontCome',
    name: "Don't Come",
    edge: '1.36%',
    description: "Like Don't Pass but placed after point is set.",
    comeOut: false,
    pointPhase: true,
  },
  {
    type: 'field',
    name: 'Field',
    edge: '5.56%',
    description: 'One-roll: wins on 2,3,4,9,10,11,12. 2 pays 2:1, 12 pays 3:1.',
    comeOut: true,
    pointPhase: true,
  },
  {
    type: 'any7',
    name: 'Any 7',
    edge: '16.67%',
    description: 'One-roll: next roll is 7 pays 4:1.',
    comeOut: true,
    pointPhase: true,
  },
]

const CHIP_VALUES = [
  { value: 5, label: '5', className: 'chip chip-5' },
  { value: 25, label: '25', className: 'chip chip-25' },
  { value: 100, label: '100', className: 'chip chip-100' },
  { value: 500, label: '500', className: 'chip chip-500' },
  { value: 1000, label: '1K', className: 'chip chip-1k' },
  { value: 5000, label: '5K', className: 'chip chip-5k' },
]

const POINT_NUMBERS = [4, 5, 6, 8, 9, 10]

const BET_TYPE_TESTID: Record<BetType, string> = {
  pass: 'pass-line',
  dontPass: 'dont-pass',
  come: 'come',
  dontCome: 'dont-come',
  field: 'field',
  any7: 'any-7',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rollDice(): [number, number] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ]
}

function formatMoney(n: number): string {
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Craps() {
  const { state, dispatch } = useGame()

  // Game state
  const [phase, setPhase] = useState<GamePhase>('betting')
  const [point, setPoint] = useState<number | null>(null)
  const [dice, setDice] = useState<[number, number]>([3, 4])
  const [diceTotal, setDiceTotal] = useState<number>(7)

  // Betting state
  const [selectedBets, setSelectedBets] = useState<ActiveBet[]>([])
  const [comeBets, setComeBets] = useState<ComeBet[]>([])
  const [betAmount, setBetAmount] = useState<number>(10)

  // Result state
  const [settlements, setSettlements] = useState<BetSettlement[]>([])
  const [resultMessage, setResultMessage] = useState<string>('')
  const [resultClass, setResultClass] = useState<string>('')
  const [rollHistory, setRollHistory] = useState<RollResult[]>([])

  // Animation
  const [animDice, setAnimDice] = useState<[number, number]>([1, 1])
  const animRef = useRef<number | null>(null)

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Determine which bets are available in the current phase
  // ---------------------------------------------------------------------------

  const isComeOut = point === null
  const availableBets = BET_OPTIONS.filter(b =>
    isComeOut ? b.comeOut : b.pointPhase,
  )

  // ---------------------------------------------------------------------------
  // Bet management
  // ---------------------------------------------------------------------------

  const totalBetAmount = selectedBets.reduce((s, b) => s + b.amount, 0)

  const toggleBet = (type: BetType) => {
    if (phase !== 'betting' && phase !== 'point') return
    setSettlements([])
    setResultMessage('')

    const existing = selectedBets.find(b => b.type === type)
    if (existing) {
      setSelectedBets(prev => prev.filter(b => b.type !== type))
    } else {
      if (betAmount > state.balance) return
      const option = BET_OPTIONS.find(b => b.type === type)
      if (!option) return
      if (isComeOut && !option.comeOut) return
      if (!isComeOut && !option.pointPhase) return
      setSelectedBets(prev => [...prev, { type, amount: betAmount }])
    }
  }

  const adjustBetAmount = (bet: ActiveBet, delta: number) => {
    const newAmount = bet.amount + delta
    if (newAmount < 5) return
    if (delta > 0 && delta > state.balance) return
    setSelectedBets(prev =>
      prev.map(b => (b.type === bet.type ? { ...b, amount: newAmount } : b)),
    )
  }

  const addChip = (value: number) => {
    setBetAmount(prev => prev + value)
  }

  const clearBetAmount = () => {
    setBetAmount(0)
  }

  // ---------------------------------------------------------------------------
  // Roll logic
  // ---------------------------------------------------------------------------

  const doRoll = useCallback(() => {
    if (selectedBets.length === 0 && comeBets.length === 0) return
    if (phase === 'rolling') return

    // Deduct new bets from balance
    const newBetTotal = selectedBets.reduce((s, b) => s + b.amount, 0)
    if (newBetTotal > state.balance) return
    if (newBetTotal > 0) {
      dispatch({ type: 'SUBTRACT_BALANCE', amount: newBetTotal })
    }

    setPhase('rolling')
    setSettlements([])
    setResultMessage('')

    // Animate dice for ~800ms
    const finalDice = rollDice()
    const finalTotal = finalDice[0] + finalDice[1]
    let frameCount = 0
    const maxFrames = 16

    const animate = () => {
      frameCount++
      if (frameCount < maxFrames) {
        setAnimDice(rollDice())
        animRef.current = requestAnimationFrame(animate)
      } else {
        // Animation complete - resolve
        setAnimDice(finalDice)
        setDice(finalDice)
        setDiceTotal(finalTotal)
        setRollHistory(prev => [{ dice: finalDice, total: finalTotal }, ...prev.slice(0, 19)])
        resolveRoll(finalDice, finalTotal)
      }
    }

    animRef.current = requestAnimationFrame(animate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBets, comeBets, phase, state.balance, point])

  // ---------------------------------------------------------------------------
  // Resolve roll outcomes
  // ---------------------------------------------------------------------------

  const resolveRoll = (finalDice: [number, number], total: number) => {
    const results: BetSettlement[] = []
    let netPayout = 0
    const currentPoint = point
    const isComeOutRoll = currentPoint === null

    // Deep-copy come bets to work with
    let updatedComeBets = [...comeBets]
    // Bets that survive this roll (multi-roll bets during point phase)
    let survivingBets: ActiveBet[] = []
    let newPoint: number | null = currentPoint

    // -----------------------------------------------------------------------
    // Settle each active bet
    // -----------------------------------------------------------------------

    for (const bet of selectedBets) {
      switch (bet.type) {
        // -------------------------------------------------------------------
        // PASS LINE
        // -------------------------------------------------------------------
        case 'pass': {
          if (isComeOutRoll) {
            if (total === 7 || total === 11) {
              // Natural - win
              const payout = bet.amount * 2
              results.push({ bet: 'Pass Line', amount: bet.amount, payout, outcome: 'win' })
              netPayout += payout
            } else if (total === 2 || total === 3 || total === 12) {
              // Craps - lose
              results.push({ bet: 'Pass Line', amount: bet.amount, payout: 0, outcome: 'lose' })
            } else {
              // Point established - bet survives
              survivingBets.push(bet)
            }
          } else {
            // Point phase
            if (total === currentPoint) {
              // Point hit - win
              const payout = bet.amount * 2
              results.push({ bet: 'Pass Line', amount: bet.amount, payout, outcome: 'win' })
              netPayout += payout
              newPoint = null
            } else if (total === 7) {
              // Seven out - lose
              results.push({ bet: 'Pass Line', amount: bet.amount, payout: 0, outcome: 'lose' })
              newPoint = null
            } else {
              // Roll continues
              survivingBets.push(bet)
            }
          }
          break
        }

        // -------------------------------------------------------------------
        // DON'T PASS
        // -------------------------------------------------------------------
        case 'dontPass': {
          if (isComeOutRoll) {
            if (total === 2 || total === 3) {
              // Win
              const payout = bet.amount * 2
              results.push({ bet: "Don't Pass", amount: bet.amount, payout, outcome: 'win' })
              netPayout += payout
            } else if (total === 12) {
              // Push (bar 12)
              results.push({ bet: "Don't Pass", amount: bet.amount, payout: bet.amount, outcome: 'push' })
              netPayout += bet.amount
            } else if (total === 7 || total === 11) {
              // Lose
              results.push({ bet: "Don't Pass", amount: bet.amount, payout: 0, outcome: 'lose' })
            } else {
              // Point established - bet survives
              survivingBets.push(bet)
            }
          } else {
            if (total === 7) {
              // Win (seven before point)
              const payout = bet.amount * 2
              results.push({ bet: "Don't Pass", amount: bet.amount, payout, outcome: 'win' })
              netPayout += payout
              newPoint = null
            } else if (total === currentPoint) {
              // Lose (point hit)
              results.push({ bet: "Don't Pass", amount: bet.amount, payout: 0, outcome: 'lose' })
              newPoint = null
            } else {
              survivingBets.push(bet)
            }
          }
          break
        }

        // -------------------------------------------------------------------
        // COME
        // -------------------------------------------------------------------
        case 'come': {
          // Come bet acts like a pass line from this roll
          if (total === 7 || total === 11) {
            const payout = bet.amount * 2
            results.push({ bet: 'Come', amount: bet.amount, payout, outcome: 'win' })
            netPayout += payout
          } else if (total === 2 || total === 3 || total === 12) {
            results.push({ bet: 'Come', amount: bet.amount, payout: 0, outcome: 'lose' })
          } else {
            // Moves to its own come point
            updatedComeBets.push({ type: 'come', amount: bet.amount, point: total })
          }
          break
        }

        // -------------------------------------------------------------------
        // DON'T COME
        // -------------------------------------------------------------------
        case 'dontCome': {
          if (total === 2 || total === 3) {
            const payout = bet.amount * 2
            results.push({ bet: "Don't Come", amount: bet.amount, payout, outcome: 'win' })
            netPayout += payout
          } else if (total === 12) {
            results.push({ bet: "Don't Come", amount: bet.amount, payout: bet.amount, outcome: 'push' })
            netPayout += bet.amount
          } else if (total === 7 || total === 11) {
            results.push({ bet: "Don't Come", amount: bet.amount, payout: 0, outcome: 'lose' })
          } else {
            updatedComeBets.push({ type: 'dontCome', amount: bet.amount, point: total })
          }
          break
        }

        // -------------------------------------------------------------------
        // FIELD (one-roll)
        // -------------------------------------------------------------------
        case 'field': {
          const fieldWins = [2, 3, 4, 9, 10, 11, 12]
          if (fieldWins.includes(total)) {
            let multiplier = 2 // 1:1 default
            if (total === 2) multiplier = 3 // 2:1
            if (total === 12) multiplier = 4 // 3:1
            const payout = bet.amount * multiplier
            results.push({ bet: 'Field', amount: bet.amount, payout, outcome: 'win' })
            netPayout += payout
          } else {
            results.push({ bet: 'Field', amount: bet.amount, payout: 0, outcome: 'lose' })
          }
          break
        }

        // -------------------------------------------------------------------
        // ANY 7 (one-roll)
        // -------------------------------------------------------------------
        case 'any7': {
          if (total === 7) {
            const payout = bet.amount * 5 // 4:1 pays 5x (bet + 4x winnings)
            results.push({ bet: 'Any 7', amount: bet.amount, payout, outcome: 'win' })
            netPayout += payout
          } else {
            results.push({ bet: 'Any 7', amount: bet.amount, payout: 0, outcome: 'lose' })
          }
          break
        }
      }
    }

    // -----------------------------------------------------------------------
    // Settle existing come bets with established points
    // -----------------------------------------------------------------------

    const remainingComeBets: ComeBet[] = []

    for (const cb of updatedComeBets) {
      // Skip newly created come bets (those whose point was just set this roll)
      // They're identified by point matching the current total AND not being in the
      // original comeBets array. Actually, let's only settle pre-existing ones.
      const isNew = !comeBets.find(
        existing =>
          existing.type === cb.type &&
          existing.amount === cb.amount &&
          existing.point === cb.point,
      )

      if (isNew) {
        // This come bet was just created this roll - don't settle yet
        remainingComeBets.push(cb)
        continue
      }

      if (cb.type === 'come') {
        if (total === cb.point) {
          const payout = cb.amount * 2
          results.push({
            bet: `Come (${cb.point})`,
            amount: cb.amount,
            payout,
            outcome: 'win',
          })
          netPayout += payout
        } else if (total === 7) {
          results.push({
            bet: `Come (${cb.point})`,
            amount: cb.amount,
            payout: 0,
            outcome: 'lose',
          })
        } else {
          remainingComeBets.push(cb)
        }
      } else {
        // dontCome
        if (total === 7) {
          const payout = cb.amount * 2
          results.push({
            bet: `Don't Come (${cb.point})`,
            amount: cb.amount,
            payout,
            outcome: 'win',
          })
          netPayout += payout
        } else if (total === cb.point) {
          results.push({
            bet: `Don't Come (${cb.point})`,
            amount: cb.amount,
            payout: 0,
            outcome: 'lose',
          })
        } else {
          remainingComeBets.push(cb)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Determine point state after this roll
    // -----------------------------------------------------------------------

    if (isComeOutRoll) {
      if (total !== 7 && total !== 11 && total !== 2 && total !== 3 && total !== 12) {
        // Point is established
        newPoint = total
      }
    }

    // If a seven-out occurred during point phase, reset point
    // (already handled above by setting newPoint = null)

    // If point was hit, reset point
    // (already handled above by setting newPoint = null)

    // -----------------------------------------------------------------------
    // Credit winnings
    // -----------------------------------------------------------------------

    if (netPayout > 0) {
      dispatch({ type: 'ADD_BALANCE', amount: netPayout })
    }

    // Also refund surviving bets back to balance (they were deducted at roll start)
    const survivingTotal = survivingBets.reduce((s, b) => s + b.amount, 0)
    if (survivingTotal > 0) {
      dispatch({ type: 'ADD_BALANCE', amount: survivingTotal })
    }

    // -----------------------------------------------------------------------
    // Build result message
    // -----------------------------------------------------------------------

    const totalWinnings = results.reduce((s, r) => s + r.payout, 0)
    const totalWagered = results.reduce((s, r) => s + r.amount, 0)
    const net = totalWinnings - totalWagered

    let msg = `Rolled ${total} (${DICE_EMOJI[finalDice[0]]}${DICE_EMOJI[finalDice[1]]})`
    let cls = ''

    if (results.length > 0) {
      if (net > 0) {
        msg += ` — Won ${formatMoney(net)} $MNKY!`
        cls = 'win'
      } else if (net < 0) {
        msg += ` — Lost ${formatMoney(Math.abs(net))} $MNKY`
        cls = 'lose'
      } else {
        msg += ' — Push'
        cls = 'push'
      }
    }

    if (isComeOutRoll && newPoint !== null && newPoint === total) {
      msg += ` | Point is ${newPoint}`
    }
    if (!isComeOutRoll && newPoint === null) {
      if (total === 7) {
        msg += ' | Seven out! New come-out roll.'
      } else if (total === currentPoint) {
        msg += ' | Point hit! New come-out roll.'
      }
    }

    // -----------------------------------------------------------------------
    // Update state
    // -----------------------------------------------------------------------

    setPoint(newPoint)
    setComeBets(remainingComeBets)
    setSettlements(results)
    setResultMessage(msg)
    setResultClass(cls)
    setSelectedBets(survivingBets)

    // Transition to result briefly, then back to appropriate phase
    setPhase('result')
    setTimeout(() => {
      if (survivingBets.length > 0 || remainingComeBets.length > 0) {
        setPhase('point')
      } else {
        setPhase(newPoint !== null ? 'point' : 'betting')
      }
    }, animDelay(3000))
  }

  // ---------------------------------------------------------------------------
  // New game / clear
  // ---------------------------------------------------------------------------

  const clearAll = () => {
    setSelectedBets([])
    setComeBets([])
    setSettlements([])
    setResultMessage('')
    setResultClass('')
    setPoint(null)
    setPhase('betting')
  }

  // ---------------------------------------------------------------------------
  // Can roll?
  // ---------------------------------------------------------------------------

  const canRoll =
    (phase === 'betting' || phase === 'point') &&
    (selectedBets.length > 0 || comeBets.length > 0)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const displayDice = phase === 'rolling' ? animDice : dice

  return (
    <div className="game-container" data-testid="game-container" data-game="craps">
      <div data-testid="game-state" data-game="craps" data-phase={phase} data-balance={state.balance} data-point={point || ''} data-dice-total={dice[0] + dice[1]} data-last-roll={resultMessage || ''} style={{display:'none'}} />
      {/* Header */}
      <div className="game-header">
        <Link to="/" className="btn btn-sm">
          &larr; Back to Lobby
        </Link>
        <h2>Craps</h2>
        <div className="game-info">
          Balance: <strong>{formatMoney(state.balance)} $MNKY</strong>
        </div>
      </div>

      {/* Dice & Point Display */}
      <div className="game-table">
        {/* Point indicator */}
        <div className="craps-point" data-testid="craps-point">
          {point !== null ? (
            <>
              <span>POINT</span>
              <span className="craps-point-number">{point}</span>
            </>
          ) : (
            <span>COME-OUT ROLL</span>
          )}
        </div>

        {/* Point number pucks */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '0.5rem 0' }}>
          {POINT_NUMBERS.map(n => (
            <span
              key={n}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2.2rem',
                height: '2.2rem',
                borderRadius: '50%',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                background: point === n ? '#e6a800' : 'rgba(255,255,255,0.08)',
                color: point === n ? '#000' : 'rgba(255,255,255,0.35)',
                border: point === n ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.12)',
                transition: 'all 0.3s',
              }}
            >
              {n}
            </span>
          ))}
        </div>

        {/* Dice */}
        <div className={`craps-dice${phase === 'rolling' ? ' rolling' : ''}`}>
          <span style={{ fontSize: '4rem', lineHeight: 1 }} data-testid="dice-1" data-value={displayDice[0]}>{DICE_EMOJI[displayDice[0]]}</span>
          <span style={{ fontSize: '4rem', lineHeight: 1 }} data-testid="dice-2" data-value={displayDice[1]}>{DICE_EMOJI[displayDice[1]]}</span>
        </div>

        {phase !== 'rolling' && diceTotal > 0 && (
          <div style={{ textAlign: 'center', fontSize: '1.2rem', marginTop: '0.25rem', opacity: 0.7 }}>
            Total: {diceTotal}
          </div>
        )}

        {/* Result message */}
        {resultMessage && (
          <div className={`game-result ${resultClass}`} style={{ marginTop: '0.75rem' }} data-testid="game-result" aria-live="polite">
            {resultMessage}
          </div>
        )}

        {/* Settlements detail */}
        {settlements.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', textAlign: 'center' }}>
            {settlements.map((s, i) => (
              <div key={i} style={{ opacity: 0.85 }}>
                {s.bet}: wagered {formatMoney(s.amount)}
                {s.outcome === 'win' && ` — won ${formatMoney(s.payout - s.amount)}`}
                {s.outcome === 'lose' && ' — lost'}
                {s.outcome === 'push' && ' — push'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Come/Don't Come bets with points */}
      {comeBets.length > 0 && (
        <div style={{ margin: '0.75rem 0', padding: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.5rem' }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.25rem' }}>Active Come Bets:</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {comeBets.map((cb, i) => (
              <span
                key={i}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '0.35rem',
                  background: cb.type === 'come' ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                  border: cb.type === 'come' ? '1px solid rgba(46,204,113,0.4)' : '1px solid rgba(231,76,60,0.4)',
                  fontSize: '0.85rem',
                }}
              >
                {cb.type === 'come' ? 'Come' : "Don't Come"} on {cb.point} ({formatMoney(cb.amount)})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bet Selection */}
      <div className="craps-bets-grid">
        {availableBets.map(option => {
          const active = selectedBets.find(b => b.type === option.type)
          return (
            <button
              key={option.type}
              className={`craps-bet-option${active ? ' selected' : ''}`}
              onClick={() => toggleBet(option.type)}
              disabled={phase === 'rolling' || phase === 'result'}
              data-testid={`craps-bet-${BET_TYPE_TESTID[option.type]}`}
              aria-label={`Bet on ${option.name}`}
              aria-pressed={!!active}
            >
              <span className="craps-bet-name">{option.name}</span>
              <span className="craps-bet-edge">Edge: {option.edge}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{option.description}</span>
              {active && (
                <span style={{ marginTop: '0.25rem', fontWeight: 'bold', color: '#ffd700' }}>
                  {formatMoney(active.amount)} $MNKY
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Bet Amount & Chips */}
      <div className="bet-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.9rem', opacity: 0.7 }}>Bet Amount:</label>
          <div className="bet-input" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="number"
              min={5}
              step={5}
              value={betAmount}
              onChange={e => setBetAmount(Math.max(0, parseInt(e.target.value) || 0))}
              style={{
                width: '5rem',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '0.35rem',
                color: 'inherit',
                padding: '0.35rem',
                fontSize: '1rem',
              }}
              disabled={phase === 'rolling'}
              data-testid="craps-bet-input"
              aria-label="Bet amount"
            />
            <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>$MNKY</span>
          </div>
          <button className="btn btn-sm btn-danger" onClick={clearBetAmount} disabled={phase === 'rolling'}>
            Clear
          </button>
        </div>
        <div className="chip-buttons">
          {CHIP_VALUES.map(chip => (
            <button
              key={chip.value}
              className={chip.className}
              onClick={() => addChip(chip.value)}
              disabled={phase === 'rolling' || chip.value > state.balance}
              data-testid={`chip-${chip.value}`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Adjust individual bet amounts */}
        {selectedBets.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            {selectedBets.map(bet => {
              const option = BET_OPTIONS.find(o => o.type === bet.type)
              return (
                <div
                  key={bet.type}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}
                >
                  <span style={{ minWidth: '6rem' }}>{option?.name}:</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => adjustBetAmount(bet, -5)}
                    disabled={phase === 'rolling' || bet.amount <= 5}
                  >
                    -5
                  </button>
                  <span style={{ fontWeight: 'bold', minWidth: '4rem', textAlign: 'center' }}>
                    {formatMoney(bet.amount)}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => adjustBetAmount(bet, 5)}
                    disabled={phase === 'rolling' || 5 > state.balance}
                  >
                    +5
                  </button>
                </div>
              )
            })}
            <div style={{ marginTop: '0.25rem', opacity: 0.6 }}>
              Total wager this roll: {formatMoney(totalBetAmount)} $MNKY
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="game-actions">
        <button
          className="btn btn-primary"
          onClick={doRoll}
          disabled={!canRoll}
          data-testid="craps-roll"
        >
          {phase === 'rolling' ? 'Rolling...' : point === null ? 'Roll Come-Out' : 'Roll Dice'}
        </button>
        <button
          className="btn btn-danger"
          onClick={clearAll}
          disabled={phase === 'rolling'}
          data-testid="craps-clear-all"
        >
          Clear All
        </button>
      </div>

      {/* Roll History */}
      {rollHistory.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.35rem' }}>Roll History</div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {rollHistory.map((r, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.15rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.8rem',
                  background:
                    r.total === 7
                      ? 'rgba(231,76,60,0.15)'
                      : POINT_NUMBERS.includes(r.total)
                        ? 'rgba(46,204,113,0.12)'
                        : 'rgba(255,255,255,0.06)',
                  border:
                    r.total === 7
                      ? '1px solid rgba(231,76,60,0.3)'
                      : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {DICE_EMOJI[r.dice[0]]}{DICE_EMOJI[r.dice[1]]} {r.total}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Game Rules Quick Reference */}
      <div className="game-info" style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.5, lineHeight: 1.6 }}>
        <strong>Quick Rules:</strong> Come-out roll: 7 or 11 wins Pass Line, 2/3/12 loses.
        Any other number becomes the Point. During Point phase, roll the Point again to win
        Pass Line, or 7 to lose (seven-out). Field and Any 7 are single-roll bets.
        Come/Don&apos;t Come work like Pass/Don&apos;t Pass but are placed during the Point phase.
      </div>
    </div>
  )
}
