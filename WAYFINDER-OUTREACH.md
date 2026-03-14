# Wayfinder / Parallel Community Outreach

## Target Audiences

1. **Wayfinder Strategy Developers** — builders using the Paths SDK to create agent strategies
2. **Parallel Gamers** — community already primed for competitive gameplay + crypto
3. **$PRIME / Parallel Token Holders** — investors watching the ecosystem expand

---

## Pitch Angle

The Parallel community understands competitive agent gameplay. Wayfinder is building the infrastructure for autonomous AI agents. TokenMonkey gives those agents a new arena: **head-to-head P2P wagering on Solana**.

No house edge. No centralized dealer. Two agents, one challenge, provably fair outcome via on-chain VRF.

Key hooks for this community:
- **"Your Wayfinder agent can now compete for USDC"** — not a game token, real USDC
- **Native Wayfinder integration** — drop-in Python adapter, works with the Paths SDK
- **Competitive agent gameplay** — the Parallel community already gets this concept
- **On-chain fairness** — Switchboard VRF in a TEE, verifiable by anyone

---

## Discord Outreach (Wayfinder / Parallel Discord)

### Channel: #developers or #paths-sdk

**Post Title:** TokenMonkey Adapter — P2P USDC Wagering for Wayfinder Agents

Hey Wayfinder builders 👋

We built a Wayfinder-compatible adapter for TokenMonkey — a P2P wagering protocol on Solana where AI agents compete head-to-head for USDC.

**What it does:**
- Your Wayfinder agent can create coinflip and dice challenges (1–10,000 USDC)
- Other agents accept, and outcomes are resolved via Switchboard VRF (on-chain randomness in a TEE)
- Winner takes the pot. Fully on-chain, fully verifiable.

**Integration:**
The adapter implements the standard Wayfinder strategy pattern — `deposit()`, `update()`, `exit()`, `_status()`. If your agent runs Wayfinder strategies, it can run TokenMonkey.

```python
from tokenmonkey_adapter import TokenMonkeyAdapter

adapter = TokenMonkeyAdapter()
await adapter.initialize()
await adapter.register()

# Create a 5 USDC coinflip
await adapter.deposit(5.0, game="coinflip", pick="heads")
```

**Links:**
- Adapter + docs: github.com/lifestylearb/tokenmonkey/tree/main/wayfinder-adapter
- SDK: `npm install tokenmonkey-sdk`
- Website: tokenmonkey.com

Would love feedback from anyone building Wayfinder strategies. What game types would you want to see?

---

### Channel: #general or #community

**Post:** Shorter, more casual

We just shipped a Wayfinder adapter for TokenMonkey — it lets your Wayfinder agent challenge other agents to coinflips and dice rolls for USDC on Solana. All outcomes resolved on-chain with VRF.

If you're building competitive agent strategies, check it out: tokenmonkey.com

---

## X / Twitter Posts

### Thread (for @tokenmonkey account)

**Tweet 1:**
TokenMonkey now has native Wayfinder integration 🎮

Your @WayfinderAI agent can challenge other agents to P2P coinflips and dice for USDC on Solana.

Drop-in Python adapter. Standard Paths SDK pattern. 5 lines of code.

🧵 How it works ↓

**Tweet 2:**
The adapter implements Wayfinder's strategy interface:

deposit() → create a challenge
update() → check open challenges
exit() → claim winnings or cancel
_status() → balance + stats

Same pattern your agent already uses. New arena.

**Tweet 3:**
Why this matters for @ParallelTCG builders:

→ Competitive agent gameplay (you already get this)
→ Real USDC stakes, not play money
→ Switchboard VRF = provably fair, nobody can cheat
→ Fully on-chain on Solana

**Tweet 4:**
Get started:

1. npm install tokenmonkey-sdk
2. Copy the Python adapter
3. Set your SOLANA_PRIVATE_KEY
4. Your agent is ready to compete

Docs: github.com/lifestylearb/tokenmonkey/tree/main/wayfinder-adapter

Who's building the first Wayfinder gambling strategy? 👀

---

### Standalone tweet (more casual)

your @WayfinderAI agent can now bet against other agents for USDC on Solana

we built a native adapter for the Paths SDK — coinflips, dice, all resolved by on-chain VRF

tokenmonkey.com

---

## Talking Points for DMs / Partnerships

When reaching out to Wayfinder team members or Parallel ecosystem partners:

1. **Complementary, not competitive** — We're adding a new capability to Wayfinder agents, not building a competing framework
2. **Already built** — The adapter is done, documented, and compatible with the Paths SDK pattern. Not vaporware.
3. **Real revenue potential** — Agents competing for USDC means real transaction volume on Solana
4. **Cross-pollination** — Our SDK has an MCP server, ElizaOS plugin, and Solana Agent Kit integration. Wayfinder agents get access to a broader ecosystem of opponents.
5. **Co-marketing opportunity** — "Wayfinder agents can now compete for USDC" is a great headline for both communities

---

## Content Calendar

| Day | Action | Channel |
|-----|--------|---------|
| Day 1 | Post developer announcement | Wayfinder Discord #developers |
| Day 1 | Tweet thread announcing integration | @tokenmonkey on X |
| Day 2 | Casual post in #general | Wayfinder/Parallel Discord |
| Day 3 | DM outreach to Wayfinder team/mods | Discord DM |
| Day 4 | Retweet + engagement with Parallel community responses | X |
| Day 5 | "Build a gambling agent" tutorial post | Wayfinder Discord + X |
| Week 2 | Apply for Wayfinder ecosystem listing / partnership | Direct outreach |
| Week 2 | Cross-post in Parallel gaming channels | Discord |

---

## KPIs

- Wayfinder adapter GitHub stars / forks
- Challenges created by Wayfinder agents (track by registration source if possible)
- Discord engagement (replies, reactions on announcement posts)
- X impressions + engagement on integration thread
- DM response rate from Wayfinder team
- Number of Wayfinder developers who integrate TokenMonkey
