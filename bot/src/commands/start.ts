import { Context } from 'telegraf'
import { getOrCreateWallet, walletExists } from '../lib/wallet-store.js'
import { findAiProof } from '../lib/ai-proof.js'
import { registerAgent, fundNewWallet, ensureUsdcAta } from '../lib/program.js'
import { registerWalletMapping } from '../lib/game-engine.js'
import { registerChat } from '../lib/notifications.js'

export async function startCommand(ctx: Context) {
  const userId = ctx.from!.id
  const chatId = ctx.chat!.id
  registerChat(userId, chatId)

  // Check if already registered
  if (walletExists(userId)) {
    const { keypair } = getOrCreateWallet(userId)
    registerWalletMapping(keypair.publicKey, userId)
    await ctx.reply(
      `Welcome back to TokenMonkey! 🐵\n\n` +
      `Your wallet: \`${keypair.publicKey.toBase58()}\`\n\n` +
      `Use /help to see available commands.`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  await ctx.reply('🐵 *Welcome to TokenMonkey!*\n\nSetting up your wallet...', {
    parse_mode: 'Markdown',
  })

  try {
    // Step 1: Generate keypair
    const { keypair } = getOrCreateWallet(userId)
    registerWalletMapping(keypair.publicKey, userId)

    await ctx.reply(`✅ Wallet created: \`${keypair.publicKey.toBase58()}\`\n\nFunding with SOL for transaction fees...`, {
      parse_mode: 'Markdown',
    })

    // Step 2: Fund with SOL
    await fundNewWallet(keypair.publicKey)
    await ctx.reply('✅ Funded with 0.01 SOL\n\nMining AI proof-of-work (this takes a few seconds)...')

    // Step 3: Mine AI proof
    const { nonce, hash } = findAiProof(keypair.publicKey)

    // Step 4: Register on-chain
    await registerAgent(keypair, nonce, hash)
    await ctx.reply('✅ Agent registered on Solana devnet!')

    // Step 5: Create USDC ATA
    await ensureUsdcAta(keypair.publicKey)

    await ctx.reply(
      `🎰 *You're all set!*\n\n` +
      `Your Solana wallet:\n\`${keypair.publicKey.toBase58()}\`\n\n` +
      `To start playing:\n` +
      `1. Deposit USDC to your wallet address (/deposit)\n` +
      `2. Create a challenge (/challenge 10 coinflip heads)\n` +
      `3. Or accept someone else's (/open then /accept <id>)\n\n` +
      `Use /help for all commands.`,
      { parse_mode: 'Markdown' }
    )
  } catch (err: any) {
    console.error('Error in /start:', err)

    // Handle "already registered" gracefully
    // Error 0x0 = account already in use (on-chain PDA exists from previous registration)
    const errMsg = err.message || ''
    const errLogs = err.transactionLogs?.join(' ') || ''
    if (
      errMsg.includes('already') ||
      errMsg.includes('AlreadyRegistered') ||
      errMsg.includes('custom program error: 0x0') ||
      errLogs.includes('already in use')
    ) {
      await ctx.reply('✅ Your agent was already registered. You\'re good to go!\n\nUse /help to see commands.')
      return
    }

    await ctx.reply(`❌ Setup failed: ${err.message}\n\nPlease try again with /start or contact support.`)
  }
}
