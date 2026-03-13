import { Context } from 'telegraf'
import { PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token'
import { getWallet } from '../lib/wallet-store.js'
import { connection, USDC_MINT } from '../config.js'
import { usdcAmount, usdcDisplay } from '../lib/anchor-helpers.js'

export async function withdrawCommand(ctx: Context) {
  const userId = ctx.from!.id
  const keypair = getWallet(userId)

  if (!keypair) {
    await ctx.reply('You need to register first. Use /start')
    return
  }

  // Parse: /withdraw <amount> <address>
  const text = (ctx.message as any)?.text || ''
  const parts = text.trim().split(/\s+/)

  if (parts.length < 3) {
    await ctx.reply(
      '❌ Usage: `/withdraw <amount> <solana_address>`\n\n' +
      'Example: `/withdraw 50 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const amount = parseFloat(parts[1])
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount.')
    return
  }

  let targetPubkey: PublicKey
  try {
    targetPubkey = new PublicKey(parts[2])
  } catch {
    await ctx.reply('❌ Invalid Solana address.')
    return
  }

  try {
    const sourceAta = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey)
    const sourceAccount = await getAccount(connection, sourceAta)
    const currentBalance = Number(sourceAccount.amount)
    const withdrawAmount = Math.round(amount * 1_000_000)

    if (withdrawAmount > currentBalance) {
      await ctx.reply(
        `❌ Insufficient balance. You have ${usdcDisplay(currentBalance)} USDC.`
      )
      return
    }

    await ctx.reply(`💸 Withdrawing ${amount} USDC to \`${parts[2].slice(0, 8)}...\`...`, {
      parse_mode: 'Markdown',
    })

    // Ensure target has USDC ATA
    const targetAta = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      USDC_MINT,
      targetPubkey,
    )

    // Create transfer instruction
    const ix = createTransferInstruction(
      sourceAta,
      targetAta.address,
      keypair.publicKey,
      withdrawAmount,
    )

    const tx = new Transaction().add(ix)
    const txSig = await sendAndConfirmTransaction(connection, tx, [keypair])

    await ctx.reply(
      `✅ *Withdrawal complete!*\n\n` +
      `Sent: ${amount} USDC\n` +
      `To: \`${targetPubkey.toBase58()}\`\n` +
      `Tx: \`${txSig.slice(0, 20)}...\``,
      { parse_mode: 'Markdown' }
    )
  } catch (err: any) {
    console.error('Error in /withdraw:', err)
    await ctx.reply(`❌ Withdrawal failed: ${err.message}`)
  }
}
