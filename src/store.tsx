import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { GameState } from './types'

type Action =
  | { type: 'CONNECT_WALLET'; address: string }
  | { type: 'DISCONNECT_WALLET' }
  | { type: 'SET_BALANCE'; amount: number }
  | { type: 'ADD_BALANCE'; amount: number }
  | { type: 'SUBTRACT_BALANCE'; amount: number }
  | { type: 'SET_SOL_BALANCE'; amount: number }
  | { type: 'SET_USERNAME'; username: string }

const initialState: GameState = {
  balance: 0,
  connected: false,
  address: null,
  chainId: null,
  username: null,
  solBalance: 0,
}

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'CONNECT_WALLET':
      return {
        ...state,
        connected: true,
        address: action.address,
        chainId: 0, // Solana
        balance: loadBalance(action.address),
        username: loadUsername(action.address),
      }
    case 'DISCONNECT_WALLET':
      return { ...initialState }
    case 'SET_BALANCE': {
      if (state.address) saveBalance(state.address, action.amount)
      return { ...state, balance: action.amount }
    }
    case 'ADD_BALANCE': {
      const newBal = state.balance + action.amount
      if (state.address) saveBalance(state.address, newBal)
      return { ...state, balance: newBal }
    }
    case 'SUBTRACT_BALANCE': {
      const newBal = Math.max(0, state.balance - action.amount)
      if (state.address) saveBalance(state.address, newBal)
      return { ...state, balance: newBal }
    }
    case 'SET_SOL_BALANCE':
      return { ...state, solBalance: action.amount }
    case 'SET_USERNAME': {
      if (state.address) saveUsername(state.address, action.username)
      return { ...state, username: action.username }
    }
    default:
      return state
  }
}

function loadBalance(address: string): number {
  const saved = localStorage.getItem(`tm_balance_${address}`)
  if (saved) return parseFloat(saved)
  localStorage.setItem(`tm_balance_${address}`, '10000')
  return 10000
}

function saveBalance(address: string, amount: number) {
  localStorage.setItem(`tm_balance_${address}`, amount.toString())
}

function loadUsername(address: string): string | null {
  return localStorage.getItem(`tm_username_${address}`)
}

function saveUsername(address: string, username: string) {
  localStorage.setItem(`tm_username_${address}`, username)
}

// --- Agent-friendly utilities ---
export function isInstantMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('instant') === 'true'
}

export function animDelay(ms: number): number {
  return isInstantMode() ? 0 : ms
}

interface GameContextType {
  state: GameState
  dispatch: React.Dispatch<Action>
  connectWallet: () => void
  disconnectWallet: () => void
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const { publicKey, connected, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const { connection } = useConnection()

  // Sync Solana wallet state into our game state
  useEffect(() => {
    if (connected && publicKey) {
      const addr = publicKey.toBase58()
      dispatch({ type: 'CONNECT_WALLET', address: addr })

      // Fetch SOL balance
      connection.getBalance(publicKey).then((balance) => {
        dispatch({ type: 'SET_SOL_BALANCE', amount: balance / LAMPORTS_PER_SOL })
      }).catch(console.error)
    } else if (!connected && state.connected) {
      dispatch({ type: 'DISCONNECT_WALLET' })
    }
  }, [connected, publicKey])

  const connectWallet = () => {
    setVisible(true)
  }

  const disconnectWallet = () => {
    disconnect().catch(console.error)
    dispatch({ type: 'DISCONNECT_WALLET' })
  }

  // Expose window.__tokenmonkey API for programmatic agent access
  useEffect(() => {
    const api = {
      getState: () => ({
        balance: state.balance,
        connected: state.connected,
        address: state.address,
        solBalance: state.solBalance,
      }),
      connect: () => connectWallet(),
      disconnect: () => disconnectWallet(),
      addBalance: (amount: number) => dispatch({ type: 'ADD_BALANCE', amount }),
      games: [
        { path: '/coinflip', name: 'Coinflip', type: 'p2p', minBet: 1, currency: 'USDC' },
        { path: '/dice', name: 'Dice', type: 'p2p', minBet: 1, currency: 'USDC' },
        { path: '/blackjack', name: 'Blackjack', type: 'simulated', houseEdge: '0.5%', minBet: 10, currency: 'credits' },
        { path: '/roulette', name: 'Roulette', type: 'simulated', houseEdge: '5.26%', minBet: 5, currency: 'credits' },
        { path: '/slots', name: 'Slots', type: 'simulated', houseEdge: '5%', minBet: 1, currency: 'credits' },
        { path: '/video-poker', name: 'Video Poker', type: 'simulated', houseEdge: '2.5%', minBet: 5, currency: 'credits' },
        { path: '/baccarat', name: 'Baccarat', type: 'simulated', houseEdge: '1.06%', minBet: 25, currency: 'credits' },
        { path: '/craps', name: 'Craps', type: 'simulated', houseEdge: '1.41%', minBet: 10, currency: 'credits' },
      ],
      version: '2.0.0',
      instantMode: isInstantMode(),
    };
    (window as any).__tokenmonkey = api
  }, [state])

  return (
    <GameContext.Provider value={{ state, dispatch, connectWallet, disconnectWallet }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}
