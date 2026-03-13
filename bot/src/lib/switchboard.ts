/**
 * Switchboard On-Demand VRF helpers for TokenMonkey bot.
 *
 * Implements the commit-reveal randomness pattern:
 *   1. createAndCommit() — create randomness account + commit in one bundle
 *   2. getRevealIx()     — get the reveal instruction (bundle with resolve_game)
 */

import * as sb from '@switchboard-xyz/on-demand'
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { connection, resolverKeypair } from '../config.js'

let sbProgram: Program | null = null
let sbQueue: PublicKey | null = null

/**
 * Initialize the Switchboard program and queue.
 * Caches the result for subsequent calls.
 */
export async function initSwitchboard(): Promise<{ program: Program; queue: PublicKey }> {
  if (sbProgram && sbQueue) {
    return { program: sbProgram, queue: sbQueue }
  }

  const provider = new AnchorProvider(
    connection,
    new Wallet(resolverKeypair),
    { commitment: 'confirmed' }
  )

  // Get the program ID for the current network
  const programId = sb.ON_DEMAND_DEVNET_PID // TODO: switch to ON_DEMAND_MAINNET_PID for mainnet

  // Load the Switchboard On-Demand program
  const idl = await Program.fetchIdl(programId, provider)
  if (!idl) {
    throw new Error('Failed to fetch Switchboard On-Demand IDL. Is the RPC responding?')
  }
  sbProgram = new Program(idl, provider)

  // Use the default devnet queue
  sbQueue = sb.ON_DEMAND_DEVNET_QUEUE // TODO: switch to ON_DEMAND_MAINNET_QUEUE for mainnet

  console.log(`  Switchboard PID:   ${programId.toBase58()}`)
  console.log(`  Switchboard queue: ${sbQueue.toBase58()}`)
  return { program: sbProgram, queue: sbQueue }
}

/**
 * Create a new Switchboard randomness account and return the keypair +
 * instructions for creating the account and committing to a slot hash.
 *
 * Returns instructions that must be bundled into the same tx as create_challenge.
 */
export async function createAndCommitRandomness(payer: PublicKey): Promise<{
  rngKeypair: Keypair
  instructions: TransactionInstruction[]
}> {
  const { program, queue } = await initSwitchboard()

  // createAndCommitIxs returns [randomness, keypair, createAndCommitIxs[]]
  // Cast program to any to work around Anchor version mismatch (our 0.32 vs SB's bundled 0.31)
  const [randomness, rngKeypair, ixs] = await sb.Randomness.createAndCommitIxs(
    program as any,
    queue,
    payer,
  )

  return { rngKeypair, instructions: ixs }
}

/**
 * Get the reveal instruction for a randomness account.
 * Must be bundled with resolve_game in the same tx.
 * Call this after at least 1 slot has elapsed since commit (~3 seconds).
 */
export async function getRevealIx(rngPubkey: PublicKey): Promise<TransactionInstruction> {
  const { program } = await initSwitchboard()
  // Cast program to any to work around Anchor version mismatch
  const randomness = new sb.Randomness(program as any, rngPubkey)
  return randomness.revealIx()
}
