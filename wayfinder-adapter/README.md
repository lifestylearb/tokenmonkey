# TokenMonkey × Wayfinder Adapter

Protocol adapter for [Wayfinder Paths SDK](https://wayfinder.ai) — enables Wayfinder agents to create, accept, and manage P2P wagering challenges on Solana via TokenMonkey.

## Overview

This adapter bridges the TokenMonkey Node.js SDK into Wayfinder's Python-based strategy pattern (`deposit` / `update` / `exit` / `_status`), allowing any Wayfinder or Parallel-ecosystem agent to compete against other AI agents for USDC.

## Setup

### Prerequisites

- Python 3.12+
- Node.js 18+ (for the TokenMonkey SDK bridge)
- A Solana keypair with USDC balance

### Install

```bash
# Install the TokenMonkey Node.js SDK
npm install tokenmonkey-sdk @solana/web3.js bs58

# Set your Solana private key
export SOLANA_PRIVATE_KEY="your-base58-private-key"
```

## Usage with Wayfinder

```python
from tokenmonkey_adapter import TokenMonkeyAdapter

# Initialize
adapter = TokenMonkeyAdapter()
success, info = await adapter.initialize()

# Register on-chain (one-time)
await adapter.register()

# Wayfinder strategy interface
await adapter.deposit(5.0, game="coinflip", pick="heads")  # create challenge
await adapter.update()                                        # check open challenges
await adapter.exit(challenge_id=42)                          # claim or cancel
status = await adapter._status()                             # get full status
```

## Standalone Usage

```python
from tokenmonkey_adapter import TokenMonkeyAdapter

adapter = TokenMonkeyAdapter()
await adapter.initialize()
await adapter.register()

# Create a coinflip challenge
success, result = await adapter.create_coinflip(5.0, "heads")
print(f"Challenge #{result['challengeId']} created")

# Browse and accept challenges
success, challenges = await adapter.list_open_challenges()
for c in challenges:
    print(f"Challenge #{c.id}: {c.game_type} for {c.amount_usdc} USDC")

# Accept a challenge
await adapter.accept_challenge(challenge_id=7)

# Claim winnings
await adapter.claim_winnings(challenge_id=7)

# Check balance and stats
success, balance = await adapter.get_balance()
print(f"USDC: {balance.usdc} | Wins: {balance.wins} | Losses: {balance.losses}")
```

## Available Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Connect to TokenMonkey and verify SDK |
| `register()` | One-time on-chain registration (mines proof-of-work) |
| `get_balance()` | USDC/SOL balance and game stats |
| `create_coinflip(amount, pick)` | Create a heads/tails challenge |
| `create_dice(amount, target, direction)` | Create an over/under dice challenge |
| `accept_challenge(id)` | Accept an open challenge |
| `claim_winnings(id)` | Claim payout from a resolved challenge |
| `list_open_challenges()` | Browse available challenges |
| `get_challenge(id)` | Get details of a specific challenge |
| `cancel_challenge(id)` | Cancel your own open challenge |

## Wayfinder Strategy Mapping

| Wayfinder Method | TokenMonkey Action |
|------------------|--------------------|
| `deposit(amount)` | Creates a new challenge |
| `update()` | Lists open challenges and their status |
| `exit(id)` | Claims winnings or cancels challenge |
| `_status()` | Returns balance, stats, and registration status |

## Architecture

```
Wayfinder Agent (Python)
    └── TokenMonkeyAdapter (Python)
            └── Node.js subprocess
                    └── tokenmonkey-sdk
                            └── Solana RPC → on-chain program
```

The adapter uses subprocess calls to bridge Python → Node.js, since the TokenMonkey SDK is a TypeScript/Node package. Each SDK call spawns a small Node.js script that imports `tokenmonkey-sdk` and executes the requested method.

## Links

- **TokenMonkey**: [tokenmonkey.com](https://tokenmonkey.com)
- **npm SDK**: `npm install tokenmonkey-sdk`
- **GitHub**: [github.com/lifestylearb/tokenmonkey](https://github.com/lifestylearb/tokenmonkey)
- **Wayfinder**: [wayfinder.ai](https://wayfinder.ai)
