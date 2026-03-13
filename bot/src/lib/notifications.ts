import { Telegraf } from 'telegraf'
import type { GameResult } from './game-engine.js'
import { usdcDisplay } from './anchor-helpers.js'

let botInstance: Telegraf | null = null

export function setBotInstance(bot: Telegraf) {
  botInstance = bot
}

// Map of telegram user ID -> chat ID (for sending messages)
const userChats = new Map<number, number>()

export function registerChat(telegramUserId: number, chatId: number) {
  userChats.set(telegramUserId, chatId)
}

export async function notifyGameResult(result: GameResult) {
  if (!botInstance) return

  const gameLabel = result.gameType === 'coinflip' ? '🪙 Coinflip' : '🎲 Dice'
  const betDisplay = usdcDisplay(result.amountUsdc)

  // Notify winner
  if (result.winnerId) {
    const chatId = userChats.get(result.winnerId)
    if (chatId) {
      await botInstance.telegram.sendMessage(
        chatId,
        `🎉 *YOU WON!*\n\n` +
        `${gameLabel} Challenge #${result.challengeId}\n` +
        `Bet: ${betDisplay} USDC each\n` +
        `Payout: *${result.payoutUsdc} USDC* (after 2.5% rake)\n\n` +
        `Your winnings have been automatically claimed!`,
        { parse_mode: 'Markdown' }
      )
    }
  }

  // Notify loser
  if (result.loserId) {
    const chatId = userChats.get(result.loserId)
    if (chatId) {
      await botInstance.telegram.sendMessage(
        chatId,
        `😔 *You lost*\n\n` +
        `${gameLabel} Challenge #${result.challengeId}\n` +
        `Lost: ${betDisplay} USDC\n\n` +
        `Better luck next time! Use /open to find new challenges.`,
        { parse_mode: 'Markdown' }
      )
    }
  }
}

export async function notifyChallengeAccepted(
  creatorTelegramId: number,
  challengeId: number,
  acceptorAddr: string,
) {
  if (!botInstance) return
  const chatId = userChats.get(creatorTelegramId)
  if (!chatId) return

  await botInstance.telegram.sendMessage(
    chatId,
    `⚔️ Your challenge #${challengeId} was accepted by \`${acceptorAddr.slice(0, 4)}...${acceptorAddr.slice(-4)}\`!\n` +
    `Resolving game...`,
    { parse_mode: 'Markdown' }
  )
}
