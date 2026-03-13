import { Context } from 'telegraf'
import { getPublicKey } from '../lib/wallet-store.js'

export async function depositCommand(ctx: Context) {
  const userId = ctx.from!.id
  const pubkey = getPublicKey(userId)

  if (!pubkey) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  const addr = pubkey.toBase58()

  await ctx.reply(
    `💳 *Deposit USDC*\n\n` +
    `Send USDC (devnet) to this Solana address:\n\n` +
    `\`${addr}\`\n\n` +
    `⚠️ This is a *devnet* address. Only send devnet USDC.\n\n` +
    `After depositing, use /balance to check your funds.`,
    { parse_mode: 'Markdown' }
  )
}
