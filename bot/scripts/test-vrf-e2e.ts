/**
 * End-to-end VRF test: exercises the full challenge lifecycle
 * with Switchboard On-Demand randomness on devnet.
 *
 * Flow: register 2 agents → fund with USDC → create challenge (commit) →
 *       accept challenge → resolve (reveal VRF) → claim winnings
 *
 * Run:  cd bot && npx tsx scripts/test-vrf-e2e.ts
 */

import 'dotenv/config'
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { connection, PROGRAM_ID, USDC_MINT, resolverKeypair, VRF_ENABLED } from '../src/config.js'
import { initSwitchboard } from '../src/lib/switchboard.js'
import { findAiProof } from '../src/lib/ai-proof.js'
import {
  fundNewWallet,
  ensureUsdcAta,
  registerAgent,
  createChallenge,
  acceptChallenge,
  resolveGame,
  claimWinnings,
  fetchChallenge,
} from '../src/lib/program.js'
import {
  GameType,
  coinflipParams,
  usdcAmount,
  usdcDisplay,
} from '../src/lib/anchor-helpers.js'

// ─── Helpers ──────────────────────────────────────────────────────
async function getUsdcBalance(owner: PublicKey): Promise<number> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner)
  try {
    const account = await getAccount(connection, ata)
    return Number(account.amount)
  } catch {
    return 0
  }
}

async function mintTestUsdc(to: PublicKey, amount: number): Promise<void> {
  // Mint to the ATA address directly (spl-token CLI expects a token account, not wallet)
  const ata = await getAssociatedTokenAddress(USDC_MINT, to)
  const { execSync } = await import('child_process')
  const solanaPath = `${process.env.HOME}/.local/share/solana/install/active_release/bin`
  const env = { ...process.env, PATH: `${solanaPath}:${process.env.PATH}` }
  execSync(
    `spl-token mint ${USDC_MINT.toBase58()} ${amount} ${ata.toBase58()} --url devnet`,
    { env, stdio: 'pipe' }
  )
}

function step(n: number, msg: string) {
  console.log(`\n  [${n}/8] ${msg}`)
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  TokenMonkey — E2E VRF Test')
  console.log('═══════════════════════════════════════════════════════\n')
  console.log(`  VRF:      ${VRF_ENABLED ? 'ON (Switchboard)' : 'OFF (test-mode)'}`)
  console.log(`  Program:  ${PROGRAM_ID.toBase58()}`)
  console.log(`  USDC:     ${USDC_MINT.toBase58()}`)
  console.log(`  Resolver: ${resolverKeypair.publicKey.toBase58()}`)

  if (VRF_ENABLED) {
    await initSwitchboard()
  }

  // Generate two fresh keypairs for this test
  const alice = Keypair.generate()
  const bob = Keypair.generate()
  console.log(`\n  Alice: ${alice.publicKey.toBase58()}`)
  console.log(`  Bob:   ${bob.publicKey.toBase58()}`)

  // ── Step 1: Fund with SOL ──
  // VRF mode needs more SOL for Switchboard randomness account rent (~0.003 SOL)
  // + LUT creation + token accounts. Fund 0.05 SOL for testing.
  step(1, 'Funding wallets with SOL...')
  const { SystemProgram: SP, Transaction: Tx, sendAndConfirmTransaction: sendTx } = await import('@solana/web3.js')
  const fundAmount = VRF_ENABLED ? 0.05 * LAMPORTS_PER_SOL : 0.01 * LAMPORTS_PER_SOL
  const fundTx = new Tx()
  fundTx.add(
    SP.transfer({ fromPubkey: resolverKeypair.publicKey, toPubkey: alice.publicKey, lamports: fundAmount }),
    SP.transfer({ fromPubkey: resolverKeypair.publicKey, toPubkey: bob.publicKey, lamports: fundAmount }),
  )
  await sendTx(connection, fundTx, [resolverKeypair])
  const aliceSol = await connection.getBalance(alice.publicKey)
  const bobSol = await connection.getBalance(bob.publicKey)
  console.log(`    Alice SOL: ${(aliceSol / LAMPORTS_PER_SOL).toFixed(4)}`)
  console.log(`    Bob SOL:   ${(bobSol / LAMPORTS_PER_SOL).toFixed(4)}`)

  // ── Step 2: Register agents ──
  step(2, 'Mining AI proofs & registering agents...')
  const aliceProof = findAiProof(alice.publicKey)
  console.log(`    Alice proof: nonce=${aliceProof.nonce} (${aliceProof.hashRate} H/s)`)
  await registerAgent(alice, aliceProof.nonce, aliceProof.hash)
  console.log('    Alice registered ✅')

  const bobProof = findAiProof(bob.publicKey)
  console.log(`    Bob proof: nonce=${bobProof.nonce} (${bobProof.hashRate} H/s)`)
  await registerAgent(bob, bobProof.nonce, bobProof.hash)
  console.log('    Bob registered ✅')

  // ── Step 3: Create USDC ATAs and mint test USDC ──
  step(3, 'Creating USDC accounts & minting test tokens...')
  await ensureUsdcAta(alice.publicKey)
  await ensureUsdcAta(bob.publicKey)

  const betAmount = 1 // 1 USDC
  await mintTestUsdc(alice.publicKey, betAmount * 2)
  await mintTestUsdc(bob.publicKey, betAmount * 2)

  const aliceUsdc = await getUsdcBalance(alice.publicKey)
  const bobUsdc = await getUsdcBalance(bob.publicKey)
  console.log(`    Alice USDC: ${usdcDisplay(aliceUsdc)}`)
  console.log(`    Bob USDC:   ${usdcDisplay(bobUsdc)}`)

  // ── Step 4: Create challenge (Alice → coinflip, picks heads) ──
  step(4, `Creating challenge: ${betAmount} USDC coinflip heads${VRF_ENABLED ? ' (VRF commit)' : ''}...`)
  const { txSig: createTx, challengeId } = await createChallenge(
    alice,
    usdcAmount(betAmount),
    GameType.Coinflip,
    coinflipParams('heads'),
  )
  console.log(`    Challenge #${challengeId} created`)
  console.log(`    TX: ${createTx}`)

  // Verify challenge state
  const preAccept = await fetchChallenge(challengeId)
  console.log(`    Status: ${preAccept.status}`)
  console.log(`    Amount: ${usdcDisplay(preAccept.amountUsdc)} USDC`)

  // ── Step 5: Accept challenge (Bob) ──
  step(5, 'Bob accepting challenge...')
  const acceptTx = await acceptChallenge(bob, challengeId)
  console.log(`    Accept TX: ${acceptTx}`)

  const postAccept = await fetchChallenge(challengeId)
  console.log(`    Status: ${postAccept.status}`)

  // ── Step 6: Resolve game (VRF reveal + resolve) ──
  step(6, `Resolving game${VRF_ENABLED ? ' (VRF reveal)' : ''}...`)
  const resolveTx = await resolveGame(challengeId)
  console.log(`    Resolve TX: ${resolveTx}`)

  const resolved = await fetchChallenge(challengeId)
  console.log(`    Status: ${resolved.status}`)
  console.log(`    Winner: ${resolved.winner.toBase58()}`)
  const winnerName = resolved.winner.toBase58() === alice.publicKey.toBase58() ? 'Alice' : 'Bob'
  console.log(`    ${winnerName} wins! 🎉`)

  // ── Step 7: Claim winnings ──
  step(7, `${winnerName} claiming winnings...`)
  const winnerKeypair = winnerName === 'Alice' ? alice : bob
  const { txSig: claimTx, payoutUsdc, rakeUsdc } = await claimWinnings(winnerKeypair, challengeId)
  console.log(`    Claim TX: ${claimTx}`)
  console.log(`    Payout: ${payoutUsdc} USDC`)
  console.log(`    Rake:   ${rakeUsdc} USDC`)

  const claimed = await fetchChallenge(challengeId)
  console.log(`    Status: ${claimed.status}`)

  // ── Step 8: Verify final balances ──
  step(8, 'Verifying final balances...')
  const aliceFinal = await getUsdcBalance(alice.publicKey)
  const bobFinal = await getUsdcBalance(bob.publicKey)
  console.log(`    Alice USDC: ${usdcDisplay(aliceFinal)} (was ${usdcDisplay(aliceUsdc)})`)
  console.log(`    Bob USDC:   ${usdcDisplay(bobFinal)} (was ${usdcDisplay(bobUsdc)})`)

  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`  ✅ E2E VRF TEST PASSED — Challenge #${challengeId}`)
  console.log(`     ${winnerName} won ${payoutUsdc} USDC (${rakeUsdc} USDC rake)`)
  console.log(`     VRF: ${VRF_ENABLED ? 'Switchboard On-Demand ✅' : 'test-mode'}`)
  console.log('═══════════════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err)
  process.exit(1)
})
