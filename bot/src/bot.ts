import { Telegraf } from 'telegraf'
import { TELEGRAM_BOT_TOKEN } from './config.js'
import { checkRateLimit } from './lib/rate-limiter.js'
import { setBotInstance, registerChat } from './lib/notifications.js'

// Commands
import { startCommand } from './commands/start.js'
import { balanceCommand } from './commands/balance.js'
import { depositCommand } from './commands/deposit.js'
import { challengeCommand } from './commands/challenge.js'
import { acceptCommand } from './commands/accept.js'
import { openCommand } from './commands/open.js'
import { historyCommand } from './commands/history.js'
import { withdrawCommand } from './commands/withdraw.js'
import { helpCommand } from './commands/help.js'

export function createBot(): Telegraf {
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN)
  setBotInstance(bot)

  // Middleware: register chat ID for notifications
  bot.use((ctx, next) => {
    if (ctx.from && ctx.chat) {
      registerChat(ctx.from.id, ctx.chat.id)
    }
    return next()
  })

  // Middleware: rate limiting
  bot.use((ctx, next) => {
    if (!ctx.from) return next()
    const text = (ctx.message as any)?.text || ''
    const command = text.split(/\s+/)[0]?.replace('/', '') || ''
    if (command && !checkRateLimit(ctx.from.id, command)) {
      return ctx.reply('⏳ Slow down! Too many requests. Please wait a moment.')
    }
    return next()
  })

  // Middleware: error handler
  bot.catch((err: any, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err)
    try {
      ctx.reply('❌ An unexpected error occurred. Please try again.')
    } catch {
      // ignore if we can't reply
    }
  })

  // Register commands
  bot.command('start', startCommand)
  bot.command('balance', balanceCommand)
  bot.command('deposit', depositCommand)
  bot.command('challenge', challengeCommand)
  bot.command('accept', acceptCommand)
  bot.command('open', openCommand)
  bot.command('history', historyCommand)
  bot.command('withdraw', withdrawCommand)
  bot.command('help', helpCommand)

  // Handle unknown text
  bot.on('text', (ctx) => {
    ctx.reply('🐵 Unknown command. Use /help to see available commands.')
  })

  return bot
}
