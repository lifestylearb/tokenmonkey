import { Context } from 'telegraf'
import { getWallet, getPublicKey } from '../lib/wallet-store.js'
import { createChallenge } from '../lib/program.js'
import {
  GameType,
  coinflipParams,
  diceParams,
  usdcAmount,
  usdcDisplay,
} from '../lib/anchor-helpers.js'

export async function challengeCommand(ctx: Context) {
  const userId = ctx.from!.id
  const keypair = getWallet(userId)

  if (!keypair) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  // Parse: /challenge <amount> <game> <params...>
  const text = (ctx.message as any)?.text || ''
  const parts = text.trim().split(/\s+/)
  // parts[0] = /challenge, parts[1] = amount, parts[2] = game, parts[3+] = params

  if (parts.length < 4) {
    await ctx.reply(
      '❌ *Usage:*\n' +
      '`/challenge <amount> coinflip <heads|tails>`\n' +
      '`/challenge <amount> dice <over|under> <target>`\n\n' +
      'Example: `/challenge 10 coinflip heads`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const amount = parseFloat(parts[1])
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Must be a positive number (USDC).')
    return
  }
  if (amount < 1) {
    await ctx.reply('❌ Minimum bet is 1 USDC.')
    return
  }
  if (amount > 10_000) {
    await ctx.reply('❌ Maximum bet is 10,000 USDC.')
    return
  }

  const game = parts[2].toLowerCase()

  try {
    if (game === 'coinflip') {
      const pick = parts[3]?.toLowerCase()
      if (pick !== 'heads' && pick !== 'tails') {
        await ctx.reply('❌ Coinflip pick must be `heads` or `tails`.', { parse_mode: 'Markdown' })
        return
      }

      await ctx.reply(`🪙 Creating coinflip challenge: ${amount} USDC on *${pick}*...`, {
        parse_mode: 'Markdown',
      })

      const { txSig, challengeId } = await createChallenge(
        keypair,
        usdcAmount(amount),
        GameType.Coinflip,
        coinflipParams(pick),
      )

      await ctx.reply(
        `✅ *Challenge Created!*\n\n` +
        `Challenge #${challengeId}\n` +
        `Game: 🪙 Coinflip (${pick})\n` +
        `Bet: ${amount} USDC\n` +
        `Expires: 24 hours\n\n` +
        `Share this with opponents:\n` +
        `"Accept challenge #${challengeId} on TokenMonkey!"\n\n` +
        `Tx: \`${txSig.slice(0, 20)}...\``,
        { parse_mode: 'Markdown' }
      )
    } else if (game === 'dice') {
      const direction = parts[3]?.toLowerCase()
      const target = parseInt(parts[4])

      if (direction !== 'over' && direction !== 'under') {
        await ctx.reply('❌ Dice direction must be `over` or `under`.', { parse_mode: 'Markdown' })
        return
      }
      if (isNaN(target) || target < 2 || target > 12) {
        await ctx.reply('❌ Dice target must be between 2 and 12.')
        return
      }

      await ctx.reply(`🎲 Creating dice challenge: ${amount} USDC on *${direction} ${target}*...`, {
        parse_mode: 'Markdown',
      })

      const { txSig, challengeId } = await createChallenge(
        keypair,
        usdcAmount(amount),
        GameType.Dice,
        diceParams(target, direction),
      )

      await ctx.reply(
        `✅ *Challenge Created!*\n\n` +
        `Challenge #${challengeId}\n` +
        `Game: 🎲 Dice (${direction} ${target})\n` +
        `Bet: ${amount} USDC\n` +
        `Expires: 24 hours\n\n` +
        `Tx: \`${txSig.slice(0, 20)}...\``,
        { parse_mode: 'Markdown' }
      )
    } else {
      await ctx.reply('❌ Unknown game type. Available: `coinflip`, `dice`', {
        parse_mode: 'Markdown',
      })
    }
  } catch (err: any) {
    console.error('Error in /challenge:', err)

    if (err.message?.includes('BetTooLow')) {
      await ctx.reply('❌ Bet is below the minimum (1 USDC).')
    } else if (err.message?.includes('BetTooHigh')) {
      await ctx.reply('❌ Bet exceeds the maximum (10,000 USDC).')
    } else if (err.message?.includes('insufficient')) {
      await ctx.reply('❌ Insufficient USDC balance. Use /deposit to fund your wallet.')
    } else {
      await ctx.reply(`❌ Failed to create challenge: ${err.message}`)
    }
  }
}
