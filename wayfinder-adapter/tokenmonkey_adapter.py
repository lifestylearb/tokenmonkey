"""
TokenMonkey Protocol Adapter for Wayfinder Paths SDK.

Enables Wayfinder agents to create, accept, and manage P2P wagering
challenges on Solana via TokenMonkey protocol.

Usage with Wayfinder:
    1. Install: pip install tokenmonkey-sdk (or use npm subprocess)
    2. Set SOLANA_PRIVATE_KEY environment variable
    3. Import this adapter in your Wayfinder strategy

Usage standalone:
    adapter = TokenMonkeyAdapter()
    await adapter.initialize()
    result = await adapter.create_coinflip(5.0, "heads")
"""

import os
import json
import asyncio
import subprocess
from typing import Optional, Tuple, Any, Dict, List
from dataclasses import dataclass


@dataclass
class Challenge:
    """Represents a TokenMonkey challenge."""
    id: int
    game_type: str
    amount_usdc: float
    creator: str
    status: str
    acceptor: Optional[str] = None
    winner: Optional[str] = None


@dataclass
class AgentBalance:
    """Agent's balance and stats."""
    usdc: float
    sol: float
    wins: int = 0
    losses: int = 0
    games_played: int = 0
    total_wagered: float = 0.0
    registered: bool = False


class TokenMonkeyAdapter:
    """
    Wayfinder-compatible protocol adapter for TokenMonkey.

    Wraps the TokenMonkey Node.js SDK via subprocess calls,
    providing a Python interface compatible with Wayfinder's
    strategy and adapter patterns.
    """

    PROTOCOL = "tokenmonkey"
    CHAIN = "solana"
    VERSION = "0.1.0"

    def __init__(self, private_key: Optional[str] = None):
        """
        Initialize the adapter.

        Args:
            private_key: Solana private key (base58). Falls back to
                         SOLANA_PRIVATE_KEY environment variable.
        """
        self.private_key = private_key or os.environ.get("SOLANA_PRIVATE_KEY", "")
        self._initialized = False
        self._registered = False

    async def initialize(self) -> Tuple[bool, Dict[str, Any]]:
        """Initialize the adapter and verify connectivity."""
        if not self.private_key:
            return False, {"error": "SOLANA_PRIVATE_KEY not set"}

        # Verify SDK is available
        try:
            result = await self._run_sdk("getBalance")
            self._initialized = True
            return True, {"status": "connected", "balance": result}
        except Exception as e:
            return False, {"error": str(e)}

    async def register(self) -> Tuple[bool, Dict[str, Any]]:
        """
        Register this agent on TokenMonkey.
        Must be called once before creating or accepting challenges.
        Mines a proof-of-work (~2 seconds).
        """
        try:
            result = await self._run_sdk("register")
            self._registered = True
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    async def get_balance(self) -> Tuple[bool, AgentBalance]:
        """Get agent's USDC/SOL balance and game stats."""
        try:
            result = await self._run_sdk("getBalance")
            balance = AgentBalance(
                usdc=result.get("usdc", 0),
                sol=result.get("sol", 0),
                wins=result.get("wins", 0),
                losses=result.get("losses", 0),
                games_played=result.get("gamesPlayed", 0),
                total_wagered=result.get("totalWagered", 0),
                registered=result.get("registered", False),
            )
            return True, balance
        except Exception as e:
            return False, AgentBalance(usdc=0, sol=0)

    async def create_coinflip(
        self, amount_usdc: float, pick: str
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Create a coinflip challenge.

        Args:
            amount_usdc: Bet amount (1-10000 USDC)
            pick: "heads" or "tails"

        Returns:
            (success, {"challengeId": int, "txSignature": str})
        """
        if pick not in ("heads", "tails"):
            return False, {"error": "pick must be 'heads' or 'tails'"}
        if amount_usdc < 1 or amount_usdc > 10000:
            return False, {"error": "amount must be 1-10000 USDC"}

        try:
            result = await self._run_sdk(
                "createCoinflip",
                {"amount": amount_usdc, "pick": pick},
            )
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    async def create_dice(
        self, amount_usdc: float, target: int, direction: str
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Create a dice challenge.

        Args:
            amount_usdc: Bet amount (1-10000 USDC)
            target: Target number (2-12)
            direction: "over" or "under"

        Returns:
            (success, {"challengeId": int, "txSignature": str})
        """
        if direction not in ("over", "under"):
            return False, {"error": "direction must be 'over' or 'under'"}
        if target < 2 or target > 12:
            return False, {"error": "target must be 2-12"}

        try:
            result = await self._run_sdk(
                "createDice",
                {"amount": amount_usdc, "target": target, "direction": direction},
            )
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    async def accept_challenge(
        self, challenge_id: int
    ) -> Tuple[bool, Dict[str, Any]]:
        """Accept an open challenge by ID."""
        try:
            result = await self._run_sdk(
                "acceptChallenge", {"challengeId": challenge_id}
            )
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    async def claim_winnings(
        self, challenge_id: int
    ) -> Tuple[bool, Dict[str, Any]]:
        """Claim winnings from a resolved challenge."""
        try:
            result = await self._run_sdk(
                "claimWinnings", {"challengeId": challenge_id}
            )
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    async def list_open_challenges(self) -> Tuple[bool, List[Challenge]]:
        """List all open challenges available to accept."""
        try:
            result = await self._run_sdk("listOpenChallenges")
            challenges = [
                Challenge(
                    id=c["id"],
                    game_type=c["gameType"],
                    amount_usdc=c["amountUsdc"],
                    creator=c["creator"],
                    status="open",
                )
                for c in result.get("challenges", [])
            ]
            return True, challenges
        except Exception as e:
            return False, []

    async def get_challenge(
        self, challenge_id: int
    ) -> Tuple[bool, Optional[Challenge]]:
        """Get details of a specific challenge."""
        try:
            c = await self._run_sdk(
                "getChallenge", {"challengeId": challenge_id}
            )
            challenge = Challenge(
                id=c["id"],
                game_type=c["gameType"],
                amount_usdc=c["amountUsdc"],
                creator=c["creator"],
                status=c["status"],
                acceptor=c.get("acceptor"),
                winner=c.get("winner"),
            )
            return True, challenge
        except Exception as e:
            return False, None

    async def cancel_challenge(
        self, challenge_id: int
    ) -> Tuple[bool, Dict[str, Any]]:
        """Cancel an open challenge you created."""
        try:
            result = await self._run_sdk(
                "cancelChallenge", {"challengeId": challenge_id}
            )
            return True, result
        except Exception as e:
            return False, {"error": str(e)}

    # ── Wayfinder Strategy Interface ─────────────────────────────────

    async def deposit(
        self, amount_usdc: float, game: str = "coinflip", **kwargs
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Wayfinder strategy interface: deposit = create challenge.

        Args:
            amount_usdc: Amount to wager
            game: "coinflip" or "dice"
            **kwargs: Game-specific params (pick, target, direction)
        """
        if game == "coinflip":
            pick = kwargs.get("pick", "heads")
            return await self.create_coinflip(amount_usdc, pick)
        elif game == "dice":
            target = kwargs.get("target", 7)
            direction = kwargs.get("direction", "over")
            return await self.create_dice(amount_usdc, target, direction)
        else:
            return False, {"error": f"Unknown game: {game}"}

    async def update(self) -> Tuple[bool, Dict[str, Any]]:
        """
        Wayfinder strategy interface: check status of open challenges.
        """
        success, challenges = await self.list_open_challenges()
        return success, {
            "open_challenges": len(challenges) if success else 0,
            "challenges": [
                {"id": c.id, "game": c.game_type, "amount": c.amount_usdc}
                for c in (challenges if success else [])
            ],
        }

    async def exit(
        self, challenge_id: Optional[int] = None
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Wayfinder strategy interface: exit = cancel or claim.
        """
        if challenge_id:
            # Try claim first, then cancel
            success, result = await self.claim_winnings(challenge_id)
            if success:
                return True, {"action": "claimed", **result}
            success, result = await self.cancel_challenge(challenge_id)
            if success:
                return True, {"action": "cancelled", **result}
            return False, {"error": "Could not claim or cancel"}
        return False, {"error": "challenge_id required"}

    async def _status(self) -> Tuple[bool, Dict[str, Any]]:
        """Wayfinder strategy interface: get current status."""
        success, balance = await self.get_balance()
        if not success:
            return False, {"error": "Could not fetch balance"}
        return True, {
            "protocol": self.PROTOCOL,
            "chain": self.CHAIN,
            "usdc_balance": balance.usdc,
            "sol_balance": balance.sol,
            "registered": balance.registered,
            "wins": balance.wins,
            "losses": balance.losses,
            "games_played": balance.games_played,
            "total_wagered": balance.total_wagered,
        }

    # ── Internal SDK Bridge ──────────────────────────────────────────

    async def _run_sdk(
        self, method: str, params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Execute a TokenMonkey SDK method via Node.js subprocess.

        Uses a small bridge script that imports tokenmonkey-sdk
        and runs the specified method.
        """
        script = self._build_script(method, params or {})

        proc = await asyncio.create_subprocess_exec(
            "node",
            "--input-type=module",
            "-e",
            script,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "SOLANA_PRIVATE_KEY": self.private_key},
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode().strip() if stderr else "Unknown error"
            raise RuntimeError(f"SDK error: {error_msg}")

        output = stdout.decode().strip()
        if not output:
            return {"success": True}

        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return {"result": output}

    def _build_script(self, method: str, params: Dict) -> str:
        """Build a Node.js script to execute a TokenMonkey SDK method."""
        params_json = json.dumps(params)

        return f"""
import {{ TokenMonkey }} from 'tokenmonkey-sdk';
import {{ Keypair }} from '@solana/web3.js';
import bs58 from 'bs58';

const kp = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
const tm = new TokenMonkey(kp);
const params = {params_json};

async function run() {{
  try {{
    let result;
    switch ('{method}') {{
      case 'register':
        result = await tm.register();
        if (result === 'already-registered') {{
          console.log(JSON.stringify({{ registered: true, alreadyRegistered: true }}));
        }} else {{
          console.log(JSON.stringify({{ registered: true, txSignature: result }}));
        }}
        break;

      case 'getBalance':
        const [usdc, sol, stats] = await Promise.all([
          tm.getUsdcBalance(),
          tm.getSolBalance(),
          tm.getPlayerStats(),
        ]);
        console.log(JSON.stringify({{
          usdc, sol,
          registered: !!stats,
          wins: stats?.wins || 0,
          losses: stats?.losses || 0,
          gamesPlayed: stats?.gamesPlayed || 0,
          totalWagered: stats?.totalWagered || 0,
        }}));
        break;

      case 'createCoinflip':
        result = await tm.createCoinflip(params.amount, params.pick);
        console.log(JSON.stringify(result));
        break;

      case 'createDice':
        result = await tm.createDice(params.amount, params.target, params.direction);
        console.log(JSON.stringify(result));
        break;

      case 'acceptChallenge':
        result = await tm.acceptChallenge(params.challengeId);
        console.log(JSON.stringify({{ txSignature: result }}));
        break;

      case 'claimWinnings':
        result = await tm.claimWinnings(params.challengeId);
        console.log(JSON.stringify(result));
        break;

      case 'listOpenChallenges':
        const challenges = await tm.getOpenChallenges();
        console.log(JSON.stringify({{
          challenges: challenges.map(c => ({{
            id: c.id,
            gameType: c.gameType,
            amountUsdc: c.amountUsdc,
            creator: c.creator.toBase58(),
            status: c.status,
          }}))
        }}));
        break;

      case 'getChallenge':
        result = await tm.getChallenge(params.challengeId);
        console.log(JSON.stringify({{
          id: result.id,
          gameType: result.gameType,
          amountUsdc: result.amountUsdc,
          creator: result.creator.toBase58(),
          acceptor: result.acceptor?.toBase58(),
          winner: result.winner?.toBase58(),
          status: result.status,
        }}));
        break;

      case 'cancelChallenge':
        result = await tm.cancelChallenge(params.challengeId);
        console.log(JSON.stringify({{ txSignature: result }}));
        break;

      default:
        throw new Error('Unknown method: {method}');
    }}
  }} catch (e) {{
    console.error(e.message || e);
    process.exit(1);
  }}
}}

run();
"""
