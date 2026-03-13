import { Context } from 'telegraf'
import { getPublicKey } from '../lib/wallet-store.js'
import { fetchPlayerChallenges } from '../lib/program.js'
import { usdcDisplay } from '../lib/anchor-helpers.js'

export async function historyCommand(ctx: Context) {
  const userId = ctx.from!.id
  const pubkey = getPublicKey(userId)

  if (!pubkey) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  try {
    const challenges = await fetchPlayerChallenges(pubkey)
    const recent = challenges
      .filter((c) => ['resolved', 'claimed'].includes(c.status))
      .slice(0, 10)

    if (recent.length === 0) {
      await ctx.reply(
        '📜 *No games played yet.*\n\nCreate or accept a challenge to get started!',
        { parse_mode: 'Markdown' }
      )
      return
    }

    const myAddr = pubkey.toBase58()
    const lines = recent.map((c) => {
      const gameLabel = c.gameType === 'coinflip' ? '🪙' : '🎲'
      const amountStr = usdcDisplay(c.amountUsdc)
      const won = c.winner.toBase58() === myAddr
      const result = won ? '✅ WON' : '❌ LOST'
      const date = new Date(c.createdAt * 1000).toLocaleDateString()
      return `${gameLabel} #${c.id} — ${amountStr} USDC — ${result} — ${date}`
    })

    await ctx.reply(
      `📜 *Recent Games*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown' }
    )
  } catch (err: any) {
    console.error('Error in /history:', err)
    await ctx.reply(`❌ Failed to fetch history: ${err.message}`)
  }
}
