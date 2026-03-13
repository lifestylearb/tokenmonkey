import { createBot } from './bot.js'
import { connection, PROGRAM_ID, USDC_MINT, resolverKeypair, VRF_ENABLED } from './config.js'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { initSwitchboard } from './lib/switchboard.js'

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  TokenMonkey — P2P AI Challenges Bot')
  console.log('═══════════════════════════════════════════════════════')
  console.log()
  console.log(`  Program ID:  ${PROGRAM_ID.toBase58()}`)
  console.log(`  USDC Mint:   ${USDC_MINT.toBase58()}`)
  console.log(`  Resolver:    ${resolverKeypair.publicKey.toBase58()}`)
  console.log(`  RPC:         ${connection.rpcEndpoint}`)

  // Check resolver balance
  const resolverBalance = await connection.getBalance(resolverKeypair.publicKey)
  console.log(`  Resolver SOL: ${(resolverBalance / LAMPORTS_PER_SOL).toFixed(4)}`)
  if (resolverBalance < 0.1 * LAMPORTS_PER_SOL) {
    console.warn('  ⚠️  Resolver balance is low! Fund it to keep registering new users.')
  }

  // Switchboard VRF
  console.log(`  VRF:          ${VRF_ENABLED ? 'ON (Switchboard On-Demand)' : 'OFF (test-mode)'}`)
  if (VRF_ENABLED) {
    await initSwitchboard()
  }
  console.log()

  const bot = createBot()

  // Set bot commands for Telegram menu
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Register & create your wallet' },
    { command: 'balance', description: 'Check USDC & SOL balance' },
    { command: 'deposit', description: 'Show deposit address' },
    { command: 'challenge', description: 'Create a new challenge' },
    { command: 'open', description: 'List open challenges' },
    { command: 'accept', description: 'Accept a challenge' },
    { command: 'history', description: 'Recent game history' },
    { command: 'withdraw', description: 'Withdraw USDC' },
    { command: 'help', description: 'Show all commands' },
  ])

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  // Start polling (this blocks until bot.stop() is called)
  console.log('🐵 TokenMonkey bot is live! Waiting for messages...')
  console.log('   Send /start to @TokenMonkey_Bot on Telegram to begin.\n')
  await bot.launch()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
