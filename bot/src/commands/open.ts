import { Context } from 'telegraf'
import { fetchOpenChallenges } from '../lib/program.js'
import { usdcDisplay } from '../lib/anchor-helpers.js'

export async function openCommand(ctx: Context) {
  try {
    const challenges = await fetchOpenChallenges()

    if (challenges.length === 0) {
      await ctx.reply(
        '📋 *No open challenges right now.*\n\n' +
        'Create one with /challenge to get started!',
        { parse_mode: 'Markdown' }
      )
      return
    }

    const lines = challenges.slice(0, 15).map((c) => {
      const gameLabel = c.gameType === 'coinflip' ? '🪙' : '🎲'
      const amountStr = usdcDisplay(c.amountUsdc)
      const creatorShort = `${c.creator.toBase58().slice(0, 4)}...${c.creator.toBase58().slice(-4)}`
      const expiresIn = Math.max(0, Math.floor((c.expiresAt - Date.now() / 1000) / 3600))

      // Decode game params for display
      let paramsStr = ''
      if (c.gameType === 'coinflip') {
        paramsStr = c.gameParams[0] === 0 ? 'heads' : 'tails'
      } else {
        const target = c.gameParams[0] | (c.gameParams[1] << 8)
        const dir = c.gameParams[2] === 0 ? 'over' : 'under'
        paramsStr = `${dir} ${target}`
      }

      return `${gameLabel} #${c.id} — *${amountStr} USDC* (${paramsStr}) by ${creatorShort} — ${expiresIn}h left`
    })

    await ctx.reply(
      `📋 *Open Challenges*\n\n` +
      lines.join('\n') +
      `\n\nUse \`/accept <id>\` to play!`,
      { parse_mode: 'Markdown' }
    )
  } catch (err: any) {
    console.error('Error in /open:', err)
    await ctx.reply(`❌ Failed to fetch challenges: ${err.message}`)
  }
}
