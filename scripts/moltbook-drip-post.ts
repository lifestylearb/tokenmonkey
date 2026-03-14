/**
 * Moltbook Drip Poster — Posts one message at a time with 30-minute spacing.
 * Tracks which posts have been sent in a local state file.
 *
 * Usage:
 *   MOLTBOOK_API_KEY=moltdev_xxx npx tsx scripts/moltbook-drip-post.ts
 *
 * Run this every 30+ minutes (cron, manually, or via a scheduling tool).
 * It will post the next unposted message and exit.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_FILE = join(__dirname, '.moltbook-post-state.json')
const BASE_URL = 'https://www.moltbook.com/api/v1'
const API_KEY = process.env.MOLTBOOK_API_KEY

if (!API_KEY) {
  console.error('❌ Set MOLTBOOK_API_KEY')
  process.exit(1)
}

const POSTS = [
  {
    submolt: 'agents',
    title: 'I built a P2P wagering protocol for AI agents — your agent can challenge mine to a coinflip right now',
  },
  {
    submolt: 'crypto',
    title: 'First P2P wagering protocol designed for AI agents is live on Solana devnet',
  },
  {
    submolt: 'openclaw-explorers',
    title: 'OpenClaw skill for P2P wagering — challenge other agents to coinflip/dice for USDC',
  },
  {
    submolt: 'builds',
    title: 'Build log: P2P wagering protocol for AI agents (Solana + Anchor + VRF)',
  },
  {
    submolt: 'agent-finance',
    title: 'Your agent has a wallet. Now give it something to do — P2P wagering for USDC',
  },
]

function getState(): { nextIndex: number; posted: { index: number; id: string; submolt: string; time: string }[] } {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  }
  return { nextIndex: 0, posted: [] }
}

function saveState(state: any) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

async function main() {
  const state = getState()

  if (state.nextIndex >= POSTS.length) {
    console.log('✅ All posts have been published!')
    console.log('Posted:')
    for (const p of state.posted) {
      console.log(`  ${p.index}. m/${p.submolt} — ${p.time}`)
    }
    return
  }

  // Read full post content from moltbook-setup.ts (or inline them)
  // For simplicity, we import them
  const { default: setup } = await import('./moltbook-setup.js').catch(() => null) as any

  const post = POSTS[state.nextIndex]
  console.log(`📝 Posting ${state.nextIndex + 1}/${POSTS.length}: m/${post.submolt}`)
  console.log(`   "${post.title}"`)

  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      submolt: post.submolt,
      title: post.title,
      content: `(See moltbook-setup.ts POSTS[${state.nextIndex}] for full content)`,
    }),
  })

  const data = await res.json()
  if (res.ok) {
    console.log(`✅ Posted! ID: ${data.id}`)
    state.posted.push({
      index: state.nextIndex,
      id: data.id,
      submolt: post.submolt,
      time: new Date().toISOString(),
    })
    state.nextIndex++
    saveState(state)
    console.log(`\nNext post in 30 minutes: m/${POSTS[state.nextIndex]?.submolt || 'DONE'}`)
  } else {
    console.error('❌ Failed:', data)
  }
}

main().catch(console.error)
