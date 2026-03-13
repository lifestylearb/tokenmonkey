import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useGame, animDelay } from '../store'
import { Card, Suit } from '../types'
import { createDeck, handValue, isBlackjack, isRed } from '../utils/cards'

type GamePhase = 'betting' | 'playing' | 'dealerTurn' | 'result'

interface Hand {
  cards: Card[]
  bet: number
  doubled: boolean
  stood: boolean
  busted: boolean
  blackjack: boolean
}

const CHIP_VALUES = [
  { value: 5, label: '5', className: 'chip-5' },
  { value: 25, label: '25', className: 'chip-25' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 500, label: '500', className: 'chip-500' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 5000, label: '5K', className: 'chip-5k' },
]

const MIN_BET = 10
const NUM_DECKS = 6

function drawCard(deck: Card[], faceUp = true): [Card, Card[]] {
  const remaining = [...deck]
  const card = { ...remaining.pop()!, faceUp }
  return [card, remaining]
}

function softValue(hand: Card[]): { value: number; soft: boolean } {
  let value = 0
  let aces = 0
  for (const card of hand) {
    if (!card.faceUp) continue
    if (card.rank === 'A') aces++
    if (card.rank === 'A') value += 11
    else if (['K', 'Q', 'J'].includes(card.rank)) value += 10
    else value += parseInt(card.rank)
  }
  let soft = aces > 0
  while (value > 21 && aces > 0) {
    value -= 10
    aces--
  }
  if (aces === 0) soft = false
  return { value, soft }
}

function dealerShouldHit(dealerCards: Card[]): boolean {
  // Dealer stands on all 17s including soft 17
  // Standard rule: dealer stands on soft 17 for ~0.5% house edge
  const { value, soft } = softValue(dealerCards)
  if (value < 17) return true
  // Dealer stands on soft 17 (S17 rule - more favorable to player)
  return false
}

function canSplit(hand: Hand, balance: number): boolean {
  if (hand.cards.length !== 2) return false
  const c1 = hand.cards[0]
  const c2 = hand.cards[1]
  // Same rank, or both are 10-value
  const v1 = c1.rank === 'A' ? 11 : (['K', 'Q', 'J'].includes(c1.rank) ? 10 : parseInt(c1.rank))
  const v2 = c2.rank === 'A' ? 11 : (['K', 'Q', 'J'].includes(c2.rank) ? 10 : parseInt(c2.rank))
  return v1 === v2 && balance >= hand.bet
}

function canDoubleDown(hand: Hand, balance: number): boolean {
  return hand.cards.length === 2 && !hand.doubled && balance >= hand.bet
}

function renderCard(card: Card): JSX.Element {
  if (!card.faceUp) {
    return (
      <div className="card-display face-down" key={Math.random()}>
        ?
      </div>
    )
  }
  const red = isRed(card.suit)
  return (
    <div
      className={`card-display face-up${red ? ' red' : ''}`}
      key={`${card.rank}${card.suit}-${Math.random()}`}
    >
      {card.rank}{card.suit}
    </div>
  )
}

function displayHandValue(cards: Card[], hideHole = false): string {
  if (hideHole) {
    const visibleCards = cards.filter(c => c.faceUp)
    if (visibleCards.length === 0) return '?'
    const val = handValue(visibleCards)
    return `${val}`
  }
  const val = handValue(cards)
  if (val > 21) return `${val} (BUST)`
  if (isBlackjack(cards)) return '21 - Blackjack!'
  return `${val}`
}

export default function Blackjack() {
  const { state, dispatch } = useGame()
  const balance = state.balance

  const [phase, setPhase] = useState<GamePhase>('betting')
  const [deck, setDeck] = useState<Card[]>(() => createDeck(NUM_DECKS))
  const [dealerCards, setDealerCards] = useState<Card[]>([])
  const [playerHands, setPlayerHands] = useState<Hand[]>([])
  const [activeHandIndex, setActiveHandIndex] = useState(0)
  const [betAmount, setBetAmount] = useState(MIN_BET)
  const [resultMessage, setResultMessage] = useState('')
  const [resultType, setResultType] = useState<'win' | 'lose' | 'push'>('push')
  const [totalWinnings, setTotalWinnings] = useState(0)
  const [handsPlayed, setHandsPlayed] = useState(0)

  // Use ref for dealer turn sequencing
  const dealerTurnInProgress = useRef(false)

  const ensureDeck = useCallback((): Card[] => {
    // Reshuffle if deck is running low
    if (deck.length < 52) {
      const fresh = createDeck(NUM_DECKS)
      setDeck(fresh)
      return fresh
    }
    return deck
  }, [deck])

  const addChip = (value: number) => {
    setBetAmount(prev => Math.min(prev + value, balance))
  }

  const clearBet = () => {
    setBetAmount(MIN_BET)
  }

  const deal = () => {
    if (betAmount < MIN_BET || betAmount > balance) return

    let currentDeck = ensureDeck()
    dispatch({ type: 'SUBTRACT_BALANCE', amount: betAmount })

    // Deal 4 cards: player, dealer, player, dealer
    let pCard1: Card, pCard2: Card, dCard1: Card, dCard2: Card

    ;[pCard1, currentDeck] = drawCard(currentDeck, true)
    ;[dCard1, currentDeck] = drawCard(currentDeck, true)
    ;[pCard2, currentDeck] = drawCard(currentDeck, true)
    ;[dCard2, currentDeck] = drawCard(currentDeck, false) // Dealer hole card face down

    const playerCards = [pCard1, pCard2]
    const dealerHand = [dCard1, dCard2]
    const playerBJ = isBlackjack(playerCards)

    const newHand: Hand = {
      cards: playerCards,
      bet: betAmount,
      doubled: false,
      stood: false,
      busted: false,
      blackjack: playerBJ,
    }

    setDeck(currentDeck)
    setDealerCards(dealerHand)
    setPlayerHands([newHand])
    setActiveHandIndex(0)
    setHandsPlayed(prev => prev + 1)

    // Check for dealer blackjack
    const dealerBJ = isBlackjack(dealerHand)

    if (playerBJ || dealerBJ) {
      // Reveal dealer hole card
      const revealedDealer = dealerHand.map(c => ({ ...c, faceUp: true }))
      setDealerCards(revealedDealer)

      if (playerBJ && dealerBJ) {
        // Push
        dispatch({ type: 'ADD_BALANCE', amount: betAmount })
        setResultMessage('Both Blackjack - Push!')
        setResultType('push')
      } else if (playerBJ) {
        // Player blackjack pays 3:2
        const payout = betAmount + Math.floor(betAmount * 1.5)
        dispatch({ type: 'ADD_BALANCE', amount: payout })
        setTotalWinnings(prev => prev + Math.floor(betAmount * 1.5))
        setResultMessage(`Blackjack! You win ${Math.floor(betAmount * 1.5).toLocaleString()} $MNKY`)
        setResultType('win')
      } else {
        // Dealer blackjack
        setTotalWinnings(prev => prev - betAmount)
        setResultMessage('Dealer Blackjack. You lose.')
        setResultType('lose')
      }
      setPhase('result')
      return
    }

    setPhase('playing')
  }

  const hit = () => {
    if (phase !== 'playing') return

    let currentDeck = [...deck]
    let card: Card
    ;[card, currentDeck] = drawCard(currentDeck, true)
    setDeck(currentDeck)

    const hands = [...playerHands]
    const hand = { ...hands[activeHandIndex] }
    hand.cards = [...hand.cards, card]

    const val = handValue(hand.cards)
    if (val > 21) {
      hand.busted = true
      hand.stood = true
    } else if (val === 21) {
      hand.stood = true
    }

    hands[activeHandIndex] = hand
    setPlayerHands(hands)

    if (hand.stood || hand.busted) {
      advanceToNextHand(hands, activeHandIndex, currentDeck)
    }
  }

  const stand = () => {
    if (phase !== 'playing') return

    const hands = [...playerHands]
    const hand = { ...hands[activeHandIndex] }
    hand.stood = true
    hands[activeHandIndex] = hand
    setPlayerHands(hands)

    advanceToNextHand(hands, activeHandIndex, deck)
  }

  const doubleDown = () => {
    if (phase !== 'playing') return
    const hand = playerHands[activeHandIndex]
    if (!canDoubleDown(hand, balance)) return

    dispatch({ type: 'SUBTRACT_BALANCE', amount: hand.bet })

    let currentDeck = [...deck]
    let card: Card
    ;[card, currentDeck] = drawCard(currentDeck, true)
    setDeck(currentDeck)

    const hands = [...playerHands]
    const updatedHand = { ...hands[activeHandIndex] }
    updatedHand.cards = [...updatedHand.cards, card]
    updatedHand.bet = updatedHand.bet * 2
    updatedHand.doubled = true
    updatedHand.stood = true

    const val = handValue(updatedHand.cards)
    if (val > 21) {
      updatedHand.busted = true
    }

    hands[activeHandIndex] = updatedHand
    setPlayerHands(hands)

    advanceToNextHand(hands, activeHandIndex, currentDeck)
  }

  const split = () => {
    if (phase !== 'playing') return
    const hand = playerHands[activeHandIndex]
    if (!canSplit(hand, balance)) return

    dispatch({ type: 'SUBTRACT_BALANCE', amount: hand.bet })

    let currentDeck = [...deck]

    // Create two new hands from the split pair
    const card1 = hand.cards[0]
    const card2 = hand.cards[1]

    let newCard1: Card, newCard2: Card
    ;[newCard1, currentDeck] = drawCard(currentDeck, true)
    ;[newCard2, currentDeck] = drawCard(currentDeck, true)

    setDeck(currentDeck)

    const hand1: Hand = {
      cards: [card1, newCard1],
      bet: hand.bet,
      doubled: false,
      stood: false,
      busted: false,
      blackjack: false,
    }

    const hand2: Hand = {
      cards: [card2, newCard2],
      bet: hand.bet,
      doubled: false,
      stood: false,
      busted: false,
      blackjack: false,
    }

    // If splitting aces, each hand gets only one card and must stand
    if (card1.rank === 'A') {
      hand1.stood = true
      hand2.stood = true
    }

    const hands = [...playerHands]
    hands.splice(activeHandIndex, 1, hand1, hand2)
    setPlayerHands(hands)

    if (card1.rank === 'A') {
      // Both hands stand after splitting aces
      startDealerTurn(hands, currentDeck)
    } else {
      // Check if first split hand got 21
      if (handValue(hand1.cards) === 21) {
        const newHands = [...hands]
        newHands[activeHandIndex] = { ...newHands[activeHandIndex], stood: true }
        setPlayerHands(newHands)
        advanceToNextHand(newHands, activeHandIndex, currentDeck)
      }
    }
  }

  const advanceToNextHand = (hands: Hand[], currentIndex: number, currentDeck: Card[]) => {
    // Find next hand that hasn't stood yet
    let nextIndex = currentIndex + 1
    while (nextIndex < hands.length && hands[nextIndex].stood) {
      nextIndex++
    }

    if (nextIndex < hands.length) {
      setActiveHandIndex(nextIndex)
    } else {
      // All hands done, dealer's turn
      startDealerTurn(hands, currentDeck)
    }
  }

  const startDealerTurn = (hands: Hand[], currentDeck: Card[]) => {
    // Check if all player hands busted
    const allBusted = hands.every(h => h.busted)

    // Reveal dealer hole card
    const revealedDealer = dealerCards.map(c => ({ ...c, faceUp: true }))
    setDealerCards(revealedDealer)
    setPhase('dealerTurn')

    if (allBusted) {
      // No need for dealer to draw
      resolveGame(hands, revealedDealer)
      return
    }

    // Dealer draws cards
    let dCards = [...revealedDealer]
    let dDeck = [...currentDeck]

    const dealerDraw = () => {
      if (dealerShouldHit(dCards)) {
        let newCard: Card
        ;[newCard, dDeck] = drawCard(dDeck, true)
        dCards = [...dCards, newCard]
        setDealerCards([...dCards])
        setDeck([...dDeck])

        setTimeout(dealerDraw, animDelay(500))
      } else {
        resolveGame(hands, dCards)
      }
    }

    setTimeout(dealerDraw, animDelay(600))
  }

  const resolveGame = (hands: Hand[], finalDealerCards: Card[]) => {
    const dealerVal = handValue(finalDealerCards)
    const dealerBust = dealerVal > 21

    let totalPayout = 0
    let totalBet = 0
    const results: string[] = []

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i]
      const playerVal = handValue(hand.cards)
      totalBet += hand.bet
      const handLabel = hands.length > 1 ? `Hand ${i + 1}: ` : ''

      if (hand.busted) {
        results.push(`${handLabel}Bust - Lost ${hand.bet.toLocaleString()}`)
      } else if (dealerBust) {
        totalPayout += hand.bet * 2
        results.push(`${handLabel}Dealer bust! Won ${hand.bet.toLocaleString()}`)
      } else if (playerVal > dealerVal) {
        totalPayout += hand.bet * 2
        results.push(`${handLabel}${playerVal} vs ${dealerVal} - Won ${hand.bet.toLocaleString()}`)
      } else if (playerVal === dealerVal) {
        totalPayout += hand.bet
        results.push(`${handLabel}Push (${playerVal})`)
      } else {
        results.push(`${handLabel}${playerVal} vs ${dealerVal} - Lost ${hand.bet.toLocaleString()}`)
      }
    }

    if (totalPayout > 0) {
      dispatch({ type: 'ADD_BALANCE', amount: totalPayout })
    }

    const netResult = totalPayout - totalBet
    setTotalWinnings(prev => prev + netResult)

    if (netResult > 0) {
      setResultType('win')
      setResultMessage(
        hands.length > 1
          ? results.join(' | ') + ` | Net: +${netResult.toLocaleString()}`
          : results[0]
      )
    } else if (netResult < 0) {
      setResultType('lose')
      setResultMessage(
        hands.length > 1
          ? results.join(' | ') + ` | Net: ${netResult.toLocaleString()}`
          : results[0]
      )
    } else {
      setResultType('push')
      setResultMessage(hands.length > 1 ? results.join(' | ') : results[0])
    }

    setPhase('result')
  }

  const newRound = () => {
    setPhase('betting')
    setDealerCards([])
    setPlayerHands([])
    setActiveHandIndex(0)
    setResultMessage('')
  }

  const activeHand = playerHands[activeHandIndex] || null
  const showDealerHole = phase === 'dealerTurn' || phase === 'result'

  return (
    <div className="game-container" data-testid="game-container" data-game="blackjack">
      <div data-testid="game-state" data-game="blackjack" data-phase={phase} data-balance={balance} data-bet={betAmount} data-player-value={activeHand ? handValue(activeHand.cards) : 0} data-dealer-value={showDealerHole ? handValue(dealerCards) : -1} data-result={resultType} style={{display:'none'}} />
      <div className="game-header">
        <h1>Blackjack</h1>
        <Link to="/" className="btn btn-sm">Back to Lobby</Link>
      </div>

      <div className="game-table">
        {/* Dealer Hand */}
        <div className="hand-area" data-testid="dealer-hand">
          <div className="hand-label">
            Dealer
            {dealerCards.length > 0 && (
              <span className="hand-value">
                {showDealerHole
                  ? displayHandValue(dealerCards)
                  : displayHandValue(dealerCards, true)}
              </span>
            )}
          </div>
          <div>
            {dealerCards.map((card, i) => renderCard(card))}
          </div>
        </div>

        {/* Result Message */}
        {phase === 'result' && resultMessage && (
          <div className={`game-result ${resultType}`} data-testid="game-result" aria-live="polite">
            {resultMessage}
          </div>
        )}

        {/* Player Hands */}
        {playerHands.map((hand, handIdx) => (
          <div
            className="hand-area"
            key={handIdx}
            data-testid={`player-hand-${handIdx}`}
            data-active={handIdx === activeHandIndex}
            style={{
              opacity: phase === 'playing' && handIdx !== activeHandIndex ? 0.5 : 1,
              borderLeft: playerHands.length > 1 && handIdx === activeHandIndex && phase === 'playing'
                ? '3px solid var(--accent)'
                : '3px solid transparent',
              paddingLeft: '12px',
            }}
          >
            <div className="hand-label">
              {playerHands.length > 1 ? `Hand ${handIdx + 1}` : 'Your Hand'}
              {hand.doubled && ' (Doubled)'}
              <span className="hand-value">
                {displayHandValue(hand.cards)}
              </span>
            </div>
            <div>
              {hand.cards.map((card, i) => renderCard(card))}
            </div>
          </div>
        ))}

        {/* Betting Phase */}
        {phase === 'betting' && (
          <>
            <div className="bet-area" style={{ marginTop: '32px' }}>
              <input
                type="number"
                className="bet-input"
                data-testid="blackjack-bet-input"
                aria-label="Bet amount"
                value={betAmount}
                min={MIN_BET}
                max={balance}
                onChange={e => {
                  const val = parseInt(e.target.value) || 0
                  setBetAmount(Math.max(0, Math.min(val, balance)))
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>$MNKY</span>
            </div>
            <div className="chip-buttons" style={{ marginBottom: '20px' }}>
              {CHIP_VALUES.map(chip => (
                <button
                  key={chip.value}
                  className={`chip ${chip.className}`}
                  data-testid={`chip-${chip.value}`}
                  onClick={() => addChip(chip.value)}
                  disabled={balance < chip.value}
                  title={`Add ${chip.label}`}
                >
                  {chip.label}
                </button>
              ))}
              <button
                className="btn btn-sm"
                data-testid="blackjack-clear-bet"
                aria-label="Clear bet"
                onClick={clearBet}
                style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, fontSize: '11px' }}
              >
                CLR
              </button>
            </div>
            <div className="game-actions">
              <button
                className="btn btn-primary"
                data-testid="blackjack-deal"
                onClick={deal}
                disabled={betAmount < MIN_BET || betAmount > balance}
              >
                Deal
              </button>
            </div>
          </>
        )}

        {/* Playing Phase Actions */}
        {phase === 'playing' && activeHand && !activeHand.stood && (
          <div className="game-actions">
            <button className="btn btn-primary" data-testid="blackjack-hit" onClick={hit}>
              Hit
            </button>
            <button className="btn btn-success" data-testid="blackjack-stand" onClick={stand}>
              Stand
            </button>
            <button
              className="btn btn-danger"
              data-testid="blackjack-double"
              onClick={doubleDown}
              disabled={!canDoubleDown(activeHand, balance)}
            >
              Double Down
            </button>
            <button
              className="btn"
              data-testid="blackjack-split"
              onClick={split}
              disabled={!canSplit(activeHand, balance)}
            >
              Split
            </button>
          </div>
        )}

        {/* Dealer Turn Indicator */}
        {phase === 'dealerTurn' && (
          <div className="game-actions">
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>
              Dealer is drawing...
            </span>
          </div>
        )}

        {/* Result Phase Actions */}
        {phase === 'result' && (
          <div className="game-actions">
            <button className="btn btn-primary" data-testid="blackjack-new-hand" onClick={newRound}>
              New Hand
            </button>
            {balance < MIN_BET && (
              <button
                className="btn btn-accent"
                data-testid="blackjack-faucet"
                onClick={() => dispatch({ type: 'ADD_BALANCE', amount: 10000 })}
              >
                Claim 10,000 $MNKY Faucet
              </button>
            )}
          </div>
        )}
      </div>

      {/* Game Info Bar */}
      <div className="game-info">
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Balance:{' '}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--green)' }}>
            {balance.toLocaleString()} $MNKY
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Session:{' '}
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            color: totalWinnings >= 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {totalWinnings >= 0 ? '+' : ''}{totalWinnings.toLocaleString()} $MNKY
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Hands:{' '}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            {handsPlayed}
          </span>
        </div>
      </div>

      {/* Rules Summary */}
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--text-muted)',
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <span>6 Decks</span>
        <span>Dealer Stands on 17</span>
        <span>Blackjack Pays 3:2</span>
        <span>Double After Split</span>
        <span>Min Bet: {MIN_BET} $MNKY</span>
        <span>House Edge: ~0.5%</span>
      </div>
    </div>
  )
}
