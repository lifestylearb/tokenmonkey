import { Context } from 'telegraf'
import { getWallet, getPublicKey } from '../lib/wallet-store.js'
import { acceptChallenge, fetchChallenge } from '../lib/program.js'
import { autoResolveAndClaim, registerWalletMapping, getTelegramUserId } from '../lib/game-engine.js'
import { notifyGameResult, notifyChallengeAccepted } from '../lib/notifications.js'
import { usdcDisplay } from '../lib/anchor-helpers.js'

export async function acceptCommand(ctx: Context) {
  const userId = ctx.from!.id
  const keypair = getWallet(userId)

  if (!keypair) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  // Parse: /accept <challenge_id>
  const text = (ctx.message as any)?.text || ''
  const parts = text.trim().split(/\s+/)
  const challengeId = parseInt(parts[1])

  if (isNaN(challengeId) || challengeId < 0) {
    await ctx.reply('❌ Usage: `/accept <challenge_id>`\n\nUse /open to see available challenges.', {
      parse_mode: 'Markdown',
    })
    return
  }

  try {
    // Fetch challenge first for validation
    const challenge = await fetchChallenge(challengeId)

    if (challenge.status !== 'open') {
      await ctx.reply(`❌ Challenge #${challengeId} is not open (status: ${challenge.status}).`)
      return
    }

    if (challenge.creator.toBase58() === keypair.publicKey.toBase58()) {
      await ctx.reply('❌ You cannot accept your own challenge!')
      return
    }

    const gameLabel = challenge.gameType === 'coinflip' ? '🪙 Coinflip' : '🎲 Dice'
    const betAmount = usdcDisplay(challenge.amountUsdc)

    await ctx.reply(
      `⚔️ Accepting ${gameLabel} challenge #${challengeId} for *${betAmount} USDC*...\n` +
      `Matching bet and resolving game...`,
      { parse_mode: 'Markdown' }
    )

    // Step 1: Accept the challenge
    await acceptChallenge(keypair, challengeId)

    // Notify the creator
    const creatorId = getTelegramUserId(challenge.creator)
    if (creatorId) {
      await notifyChallengeAccepted(
        creatorId,
        challengeId,
        keypair.publicKey.toBase58(),
      )
    }

    // Step 2: Auto-resolve and claim
    const result = await autoResolveAndClaim(challengeId)

    // Step 3: Notify both players
    await notifyGameResult(result)

    // Also reply in the current chat with the result
    const won = result.winner.toBase58() === keypair.publicKey.toBase58()
    if (won) {
      await ctx.reply(
        `🎉 *Challenge #${challengeId} — YOU WON!*\n\n` +
        `Payout: *${result.payoutUsdc} USDC*\n` +
        `(${betAmount} x2 minus 2.5% rake)`,
        { parse_mode: 'Markdown' }
      )
    } else {
      await ctx.reply(
        `😔 *Challenge #${challengeId} — You lost*\n\n` +
        `Lost: ${betAmount} USDC\n\n` +
        `Use /open to find your next game!`,
        { parse_mode: 'Markdown' }
      )
    }
  } catch (err: any) {
    console.error('Error in /accept:', err)

    if (err.message?.includes('ChallengeNotOpen')) {
      await ctx.reply('❌ This challenge is no longer open (someone else may have accepted it).')
    } else if (err.message?.includes('CannotAcceptOwnChallenge')) {
      await ctx.reply('❌ You cannot accept your own challenge!')
    } else if (err.message?.includes('insufficient')) {
      await ctx.reply('❌ Insufficient USDC balance. You need to match the bet amount. Use /deposit.')
    } else {
      await ctx.reply(`❌ Failed to accept challenge: ${err.message}`)
    }
  }
}
