import { createHash } from 'crypto'
import { PublicKey } from '@solana/web3.js'
import { AI_PROOF_DIFFICULTY } from '../config.js'

/**
 * Mine an AI proof-of-work: find nonce such that
 * SHA-256(agentPubkey || nonce_le_u64) has >= difficulty leading zero bits.
 *
 * At difficulty 20, this takes ~1M hashes (~1-3 seconds).
 */
export function findAiProof(
  agentPubkey: PublicKey,
  difficulty: number = AI_PROOF_DIFFICULTY,
): { nonce: bigint; hash: Buffer } {
  const pubkeyBuf = agentPubkey.toBuffer()
  let nonce = BigInt(0)

  while (true) {
    const nonceBuffer = Buffer.alloc(8)
    nonceBuffer.writeBigUInt64LE(nonce)
    const preimage = Buffer.concat([pubkeyBuf, nonceBuffer])
    const hash = createHash('sha256').update(preimage).digest()

    let leadingZeros = 0
    for (const byte of hash) {
      if (byte === 0) {
        leadingZeros += 8
      } else {
        leadingZeros += Math.clz32(byte) - 24
        break
      }
    }

    if (leadingZeros >= difficulty) {
      return { nonce, hash }
    }
    nonce++
  }
}
