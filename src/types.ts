export type Suit = '♠' | '♥' | '♦' | '♣'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  suit: Suit
  rank: Rank
  faceUp: boolean
}

export interface GameState {
  balance: number
  connected: boolean
  address: string | null
  chainId: number | null
  username: string | null
  solBalance: number
}

export type RouletteColor = 'red' | 'black' | 'green'

export interface RouletteBet {
  type: 'straight' | 'red' | 'black' | 'odd' | 'even' | 'high' | 'low' | 'dozen' | 'column' | 'split' | 'street' | 'corner'
  numbers: number[]
  amount: number
}

export interface SlotSymbol {
  id: string
  emoji: string
  name: string
  multiplier: number
}

export interface PokerHand {
  name: string
  payout: number
}
