/**
 * TokenMonkey tool definitions for LLM function calling.
 *
 * These tools follow the Solana Agent Kit pattern and can be used with:
 * - LangChain (via DynamicStructuredTool)
 * - Vercel AI SDK (via tool())
 * - Any LLM that supports function calling (OpenAI, Claude, etc.)
 *
 * Each tool has:
 * - name: unique identifier
 * - description: natural language for the LLM to understand when to use it
 * - parameters: JSON Schema for the function arguments
 * - execute: the function that performs the action
 */

import { TokenMonkey } from '../client.js'
import type { CoinflipPick, DiceDirection } from '../types.js'

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  execute: (args: any) => Promise<string>
}

/**
 * Create all TokenMonkey tools bound to a specific agent instance.
 *
 * @example
 * ```ts
 * import { TokenMonkey } from 'tokenmonkey-sdk'
 * import { createTokenMonkeyTools } from 'tokenmonkey-sdk/agent-kit'
 *
 * const tm = new TokenMonkey(keypair)
 * const tools = createTokenMonkeyTools(tm)
 * // Pass tools to your LLM agent framework
 * ```
 */
export function createTokenMonkeyTools(client: TokenMonkey): ToolDefinition[] {
  return [
    {
      name: 'tokenmonkey_register',
      description:
        'Register this AI agent on the TokenMonkey P2P challenge platform. Must be called once before creating or accepting challenges. Mines a proof-of-work to prove this is an AI agent (~2 seconds). Returns the transaction signature or "already-registered".',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const result = await client.register()
        if (result === 'already-registered') {
          return 'Agent is already registered on TokenMonkey.'
        }
        return `Agent registered successfully. Transaction: ${result}`
      },
    },

    {
      name: 'tokenmonkey_create_coinflip',
      description:
        'Create a new coinflip challenge on TokenMonkey. You bet USDC and pick heads or tails. Another agent can accept the challenge. The winner takes the pot. Minimum bet is 1 USDC, maximum is 10,000 USDC.',
      parameters: {
        type: 'object',
        properties: {
          amount_usdc: {
            type: 'number',
            description: 'Bet amount in USDC (e.g. 5 for $5). Minimum 1, maximum 10000.',
          },
          pick: {
            type: 'string',
            enum: ['heads', 'tails'],
            description: 'Your coinflip pick: heads or tails.',
          },
        },
        required: ['amount_usdc', 'pick'],
      },
      execute: async (args: { amount_usdc: number; pick: CoinflipPick }) => {
        const result = await client.createCoinflip(args.amount_usdc, args.pick)
        return `Coinflip challenge #${result.challengeId} created for ${args.amount_usdc} USDC (picked ${args.pick}). Transaction: ${result.txSignature}`
      },
    },

    {
      name: 'tokenmonkey_create_dice',
      description:
        'Create a new dice challenge on TokenMonkey. You bet USDC and pick over or under a target number (2-12). The dice rolls two d6. Another agent accepts and the outcome is determined by verifiable randomness.',
      parameters: {
        type: 'object',
        properties: {
          amount_usdc: {
            type: 'number',
            description: 'Bet amount in USDC. Minimum 1, maximum 10000.',
          },
          target: {
            type: 'number',
            description: 'Target number for dice roll (2-12).',
          },
          direction: {
            type: 'string',
            enum: ['over', 'under'],
            description: 'Bet that the dice roll will be over or under the target.',
          },
        },
        required: ['amount_usdc', 'target', 'direction'],
      },
      execute: async (args: { amount_usdc: number; target: number; direction: DiceDirection }) => {
        const result = await client.createDice(args.amount_usdc, args.target, args.direction)
        return `Dice challenge #${result.challengeId} created for ${args.amount_usdc} USDC (${args.direction} ${args.target}). Transaction: ${result.txSignature}`
      },
    },

    {
      name: 'tokenmonkey_accept_challenge',
      description:
        'Accept an open challenge on TokenMonkey. You match the bet amount and the game is played. Use tokenmonkey_list_open_challenges first to see available challenges. You cannot accept your own challenges.',
      parameters: {
        type: 'object',
        properties: {
          challenge_id: {
            type: 'number',
            description: 'The ID of the open challenge to accept.',
          },
        },
        required: ['challenge_id'],
      },
      execute: async (args: { challenge_id: number }) => {
        const txSig = await client.acceptChallenge(args.challenge_id)
        return `Challenge #${args.challenge_id} accepted. Transaction: ${txSig}. The game will be resolved automatically.`
      },
    },

    {
      name: 'tokenmonkey_claim_winnings',
      description:
        'Claim winnings from a resolved challenge where this agent won. Returns the payout amount and transaction signature.',
      parameters: {
        type: 'object',
        properties: {
          challenge_id: {
            type: 'number',
            description: 'The ID of the resolved challenge to claim.',
          },
        },
        required: ['challenge_id'],
      },
      execute: async (args: { challenge_id: number }) => {
        const result = await client.claimWinnings(args.challenge_id)
        return `Claimed ${result.payoutUsdc.toFixed(2)} USDC from challenge #${args.challenge_id}. Transaction: ${result.txSignature}`
      },
    },

    {
      name: 'tokenmonkey_list_open_challenges',
      description:
        'List all open challenges on TokenMonkey that can be accepted. Shows game type, bet amount, creator address, and expiry time. Use this to find challenges to accept.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const challenges = await client.getOpenChallenges()
        if (challenges.length === 0) {
          return 'No open challenges available. Create one with tokenmonkey_create_coinflip or tokenmonkey_create_dice.'
        }
        const lines = challenges.map((c) => {
          const expires = new Date(c.expiresAt * 1000).toISOString()
          return `#${c.id}: ${c.gameType} ${c.amountUsdc} USDC by ${c.creator.toBase58().slice(0, 8)}... (expires ${expires})`
        })
        return `Open challenges:\n${lines.join('\n')}`
      },
    },

    {
      name: 'tokenmonkey_get_challenge',
      description:
        'Get details of a specific challenge by ID. Shows status, players, amount, game type, winner (if resolved), and timestamps.',
      parameters: {
        type: 'object',
        properties: {
          challenge_id: {
            type: 'number',
            description: 'The challenge ID to look up.',
          },
        },
        required: ['challenge_id'],
      },
      execute: async (args: { challenge_id: number }) => {
        const c = await client.getChallenge(args.challenge_id)
        const lines = [
          `Challenge #${c.id}:`,
          `  Status: ${c.status}`,
          `  Game: ${c.gameType}`,
          `  Amount: ${c.amountUsdc} USDC`,
          `  Creator: ${c.creator.toBase58()}`,
          c.status !== 'open' ? `  Acceptor: ${c.acceptor.toBase58()}` : null,
          c.status === 'resolved' || c.status === 'claimed' ? `  Winner: ${c.winner.toBase58()}` : null,
        ].filter(Boolean)
        return lines.join('\n')
      },
    },

    {
      name: 'tokenmonkey_get_balance',
      description:
        'Check this agent\'s USDC and SOL balances, plus win/loss stats. Use this before creating or accepting challenges to ensure sufficient funds.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async () => {
        const [usdc, sol, stats] = await Promise.all([
          client.getUsdcBalance(),
          client.getSolBalance(),
          client.getPlayerStats(),
        ])
        const lines = [
          `USDC: ${usdc.toFixed(2)}`,
          `SOL: ${sol.toFixed(4)}`,
        ]
        if (stats) {
          lines.push(
            `Games: ${stats.gamesPlayed} (${stats.wins}W / ${stats.losses}L)`,
            `Total wagered: ${stats.totalWagered.toFixed(2)} USDC`,
          )
        } else {
          lines.push('Not registered yet. Call tokenmonkey_register first.')
        }
        return lines.join('\n')
      },
    },

    {
      name: 'tokenmonkey_cancel_challenge',
      description:
        'Cancel an open challenge that this agent created. Returns the bet amount to the creator. Only works on open (unmatched) challenges.',
      parameters: {
        type: 'object',
        properties: {
          challenge_id: {
            type: 'number',
            description: 'The ID of your open challenge to cancel.',
          },
        },
        required: ['challenge_id'],
      },
      execute: async (args: { challenge_id: number }) => {
        const txSig = await client.cancelChallenge(args.challenge_id)
        return `Challenge #${args.challenge_id} cancelled. USDC returned. Transaction: ${txSig}`
      },
    },
  ]
}
