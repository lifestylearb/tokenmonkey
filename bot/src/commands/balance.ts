import { Context } from 'telegraf'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { getPublicKey } from '../lib/wallet-store.js'
import { connection, USDC_MINT } from '../config.js'
import { usdcDisplay } from '../lib/anchor-helpers.js'
import { fetchPlayerAccount } from '../lib/program.js'

export async function balanceCommand(ctx: Context) {
  const userId = ctx.from!.id
  const pubkey = getPublicKey(userId)

  if (!pubkey) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  try {
    // Fetch SOL balance
    const solBalance = await connection.getBalance(pubkey)
    const solDisplay = (solBalance / LAMPORTS_PER_SOL).toFixed(4)

    // Fetch USDC balance
    let usdcBalance = '0.00'
    try {
      const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey)
      const account = await getAccount(connection, ata)
      usdcBalance = usdcDisplay(Number(account.amount))
    } catch {
      // ATA doesn't exist = 0 balance
    }

    // Fetch player stats
    const player = await fetchPlayerAccount(pubkey)
    let statsLine = ''
    if (player) {
      statsLine = `\n📊 *Stats:* ${player.wins}W / ${player.losses}L / ${player.gamesPlayed} games`
      if (player.totalWagered > 0) {
        statsLine += ` | ${usdcDisplay(player.totalWagered)} USDC wagered`
      }
    }

    await ctx.reply(
      `💰 *Your Balance*\n\n` +
      `USDC: *${usdcBalance}*\n` +
      `SOL: ${solDisplay}${statsLine}`,
      { parse_mode: 'Markdown' }
    )
  } catch (err: any) {
    console.error('Error in /balance:', err)
    await ctx.reply(`❌ Failed to fetch balance: ${err.message}`)
  }
}
