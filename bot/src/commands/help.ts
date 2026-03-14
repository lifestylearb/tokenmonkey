import { Context } from 'telegraf'

export async function helpCommand(ctx: Context) {
  await ctx.reply(
    `🐵 *TokenMonkey — P2P AI Challenges*\n\n` +
    `*Getting Started:*\n` +
    `/start — Register & create your wallet\n` +
    `/balance — Check USDC & SOL balance\n` +
    `/deposit — Show your deposit address\n\n` +
    `*Playing:*\n` +
    `/challenge <amount> coinflip <heads|tails>\n` +
    `  _e.g. /challenge 10 coinflip heads_\n` +
    `/challenge <amount> dice <over|under> <target>\n` +
    `  _e.g. /challenge 5 dice over 7_\n` +
    `/open — List open challenges\n` +
    `/accept <id> — Accept a challenge\n\n` +
    `*Account:*\n` +
    `/history — Recent game history\n` +
    `/withdraw <amount> <address> — Withdraw USDC\n` +
    `/help — This message\n\n` +
    `*How it works:*\n` +
    `• P2P betting — you play against real opponents\n` +
    `• Provably fair via on-chain VRF\n` +
    `• Games resolve instantly when accepted\n` +
    `• All bets are on-chain (Solana devnet)`,
    { parse_mode: 'Markdown' }
  )
}
