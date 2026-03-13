#!/bin/bash
set -e

# ============================================================================
# TokenMonkey ($MNKY) - Multi-Chain Token Deployment Script
# Deploys $MNKY on both Ethereum and Solana
# ============================================================================

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   🐵 TokenMonkey \$MNKY - Token Deployer     ║"
echo "  ║   Ethereum (ERC-20) + Solana (SPL Token)     ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"

NETWORK=${1:-testnet}

if [ "$NETWORK" == "mainnet" ]; then
  echo -e "${RED}${BOLD}⚠️  MAINNET DEPLOYMENT${NC}"
  echo -e "This will deploy real tokens on Ethereum mainnet and Solana mainnet-beta."
  echo -e "Make sure your wallets are funded with ETH and SOL for gas fees."
  echo ""
  read -p "Type 'DEPLOY' to confirm mainnet deployment: " confirm
  if [ "$confirm" != "DEPLOY" ]; then
    echo "Aborted."
    exit 1
  fi
  ETH_NETWORK="mainnet"
  SOL_NETWORK="mainnet-beta"
else
  echo -e "${YELLOW}Deploying to TESTNETS (Sepolia + Devnet)${NC}"
  ETH_NETWORK="sepolia"
  SOL_NETWORK="devnet"
fi

echo ""
echo -e "${BOLD}Step 1/4: Deploying on Ethereum ($ETH_NETWORK)${NC}"
echo "─────────────────────────────────────────"
cd "$(dirname "$0")/ethereum"

if [ ! -f .env ]; then
  echo -e "${RED}Missing .env file in contracts/ethereum/${NC}"
  echo "Copy .env.example to .env and fill in your keys:"
  echo "  cp .env.example .env"
  echo ""
  ETH_DEPLOYED=false
else
  echo "Compiling contracts..."
  npx hardhat compile --quiet
  echo -e "${GREEN}✓ Compiled${NC}"

  echo "Deploying MNKY to $ETH_NETWORK..."
  DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.ts --network $ETH_NETWORK 2>&1)
  echo "$DEPLOY_OUTPUT"

  ETH_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "MNKY deployed to:" | awk '{print $NF}')
  if [ -n "$ETH_ADDRESS" ]; then
    echo -e "${GREEN}✓ Ethereum deployment successful: $ETH_ADDRESS${NC}"
    ETH_DEPLOYED=true
  else
    echo -e "${RED}✗ Ethereum deployment failed${NC}"
    ETH_DEPLOYED=false
  fi
fi

echo ""
echo -e "${BOLD}Step 2/4: Deploying on Solana ($SOL_NETWORK)${NC}"
echo "─────────────────────────────────────────"
cd "$(dirname "$0")/../solana"

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

if ! command -v solana &> /dev/null; then
  echo -e "${YELLOW}Installing Solana CLI...${NC}"
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

solana config set --url $SOL_NETWORK --quiet 2>/dev/null

# Check for wallet
if [ ! -f deploy-wallet.json ]; then
  echo "Generating new deploy wallet..."
  solana-keygen new --outfile deploy-wallet.json --no-bip39-passphrase --force
fi

solana config set --keypair "$(pwd)/deploy-wallet.json" --quiet 2>/dev/null

WALLET=$(solana address)
BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}')
echo "Wallet: $WALLET"
echo "Balance: $(solana balance 2>/dev/null)"

if [ "$BALANCE" -lt 50000000 ] 2>/dev/null; then
  if [ "$SOL_NETWORK" == "devnet" ]; then
    echo "Requesting airdrop..."
    solana airdrop 2 2>/dev/null || echo -e "${YELLOW}Airdrop rate limited - fund wallet manually at https://faucet.solana.com${NC}"
  else
    echo -e "${RED}Insufficient SOL balance. Fund wallet: $WALLET${NC}"
  fi
fi

BALANCE=$(solana balance --lamports 2>/dev/null | awk '{print $1}')
if [ "$BALANCE" -gt 50000000 ] 2>/dev/null; then
  echo "Creating SPL token..."
  MINT_OUTPUT=$(spl-token create-token --decimals 9 2>&1)
  MINT_ADDRESS=$(echo "$MINT_OUTPUT" | grep "Creating token" | awk '{print $3}')

  if [ -n "$MINT_ADDRESS" ]; then
    echo -e "${GREEN}✓ Token mint created: $MINT_ADDRESS${NC}"

    echo "Creating token account..."
    spl-token create-account $MINT_ADDRESS 2>&1

    echo "Minting 50 billion tokens..."
    spl-token mint $MINT_ADDRESS 50000000000 2>&1

    echo -e "${GREEN}✓ Solana deployment successful${NC}"
    SOL_DEPLOYED=true

    echo ""
    echo "Token supply: $(spl-token supply $MINT_ADDRESS 2>/dev/null)"
  else
    echo -e "${RED}✗ Token creation failed${NC}"
    SOL_DEPLOYED=false
  fi
else
  echo -e "${YELLOW}⚠ Insufficient balance - skipping Solana deployment${NC}"
  echo "Fund wallet $WALLET and re-run this script"
  SOL_DEPLOYED=false
fi

echo ""
echo -e "${BOLD}Step 3/4: Deployment Summary${NC}"
echo "─────────────────────────────────────────"
echo -e "Network:    ${CYAN}$NETWORK${NC}"
echo -e "Token:      TokenMonkey (\$MNKY)"
echo -e "Supply:     100,000,000,000 (100B max)"
echo ""

if [ "$ETH_DEPLOYED" == "true" ]; then
  echo -e "Ethereum:   ${GREEN}✓ $ETH_ADDRESS${NC}"
  if [ "$ETH_NETWORK" == "mainnet" ]; then
    echo -e "            https://etherscan.io/token/$ETH_ADDRESS"
  else
    echo -e "            https://sepolia.etherscan.io/token/$ETH_ADDRESS"
  fi
else
  echo -e "Ethereum:   ${RED}✗ Not deployed${NC}"
fi

if [ "$SOL_DEPLOYED" == "true" ]; then
  echo -e "Solana:     ${GREEN}✓ $MINT_ADDRESS${NC}"
  if [ "$SOL_NETWORK" == "mainnet-beta" ]; then
    echo -e "            https://solscan.io/token/$MINT_ADDRESS"
  else
    echo -e "            https://solscan.io/token/$MINT_ADDRESS?cluster=devnet"
  fi
else
  echo -e "Solana:     ${RED}✗ Not deployed${NC}"
fi

echo ""
echo -e "${BOLD}Step 4/4: Next Steps${NC}"
echo "─────────────────────────────────────────"
echo "1. Update casino app with contract addresses"
echo "2. Add liquidity on Uniswap (ETH/MNKY) and Raydium (SOL/MNKY)"
echo "3. Configure DNS: tokenmonkey.io → A 76.76.21.21"
echo "4. Upload Solana metadata.json to Arweave/IPFS"
echo ""
echo -e "${CYAN}${BOLD}🐵 TokenMonkey deployment complete!${NC}"
