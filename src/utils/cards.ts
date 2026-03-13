import { Card, Suit, Rank } from '../types'

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function createDeck(numDecks = 1): Card[] {
  const deck: Card[] = []
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, faceUp: true })
      }
    }
  }
  return shuffle(deck)
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11
  if (['K', 'Q', 'J'].includes(card.rank)) return 10
  return parseInt(card.rank)
}

export function handValue(hand: Card[]): number {
  let value = 0
  let aces = 0
  for (const card of hand) {
    if (card.rank === 'A') aces++
    value += cardValue(card)
  }
  while (value > 21 && aces > 0) {
    value -= 10
    aces--
  }
  return value
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand) === 21
}

export function cardDisplay(card: Card): string {
  if (!card.faceUp) return '🂠'
  return `${card.rank}${card.suit}`
}

export function isRed(suit: Suit): boolean {
  return suit === '♥' || suit === '♦'
}

// Provably fair RNG seed (for display purposes)
export function generateSeed(): string {
  const chars = '0123456789abcdef'
  let seed = '0x'
  for (let i = 0; i < 64; i++) {
    seed += chars[Math.floor(Math.random() * chars.length)]
  }
  return seed
}
