/**
 * Devnet Initialization & Full Lifecycle Test
 *
 * 1. Creates a test USDC mint
 * 2. Initializes CasinoConfig PDA
 * 3. Registers two agents (with AI proof-of-work)
 * 4. Agent A creates a coinflip challenge
 * 5. Agent B accepts
 * 6. Resolver resolves the game
 * 7. Winner claims winnings (with skill answer)
 *
 * Run: npx tsx scripts/devnet-init-and-test.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenmonkey } from "../target/types/tokenmonkey";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────
const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("92hWXc3pHexUCxQ2YYxTrFwqUPpRn173fZcXBSFia11b");
const ONE_USDC = 1_000_000;
const USDC_DECIMALS = 6;

// ─── Helpers ─────────────────────────────────────────────────────────
function findAiProof(agentPubkey: PublicKey, difficulty: number): { nonce: bigint; hash: Buffer } {
  let nonce = BigInt(0);
  while (true) {
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(nonce);
    const preimage = Buffer.concat([agentPubkey.toBuffer(), nonceBuffer]);
    const hash = createHash("sha256").update(preimage).digest();

    let leadingZeros = 0;
    for (const byte of hash) {
      if (byte === 0) {
        leadingZeros += 8;
      } else {
        leadingZeros += Math.clz32(byte) - 24;
        break;
      }
    }

    if (leadingZeros >= difficulty) {
      return { nonce, hash };
    }
    nonce++;
  }
}

function computeSkillAnswer(outcome: Buffer, challengeId: bigint): Buffer {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(challengeId);
  const preimage = Buffer.concat([outcome, idBuffer]);
  return createHash("sha256").update(preimage).digest();
}

async function transferSol(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  lamports: number,
) {
  const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );
  await sendAndConfirmTransaction(connection, tx, [from]);
}

function log(step: string, msg: string) {
  console.log(`\n✅ [${step}] ${msg}`);
}

function logError(step: string, msg: string) {
  console.error(`\n❌ [${step}] ${msg}`);
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  TokenMonkey Casino — Devnet Init & Lifecycle Test");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Set up Anchor provider
  const connection = new Connection(RPC_URL, "confirmed");

  // Load wallet from default Solana keypair
  const walletPath = path.join(
    process.env.HOME || "/Users/sepehr.ai",
    ".config/solana/id.json"
  );
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const adminWallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, adminWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load IDL and create program
  const idlPath = path.join(__dirname, "..", "target", "idl", "tokenmonkey.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<Tokenmonkey>;

  console.log(`Admin wallet: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Program ID:   ${program.programId.toBase58()}`);

  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`Admin SOL:    ${(adminBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 1 & 2: Initialize CasinoConfig (or reuse existing)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 1: CasinoConfig & USDC Mint ───");

  const [casinoConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("casino_config")],
    program.programId,
  );

  let usdcMint: PublicKey;
  let revenueTokenAccount: PublicKey;

  // Check if already initialized
  const existingConfig = await connection.getAccountInfo(casinoConfigPda);
  if (existingConfig) {
    // Reuse existing config — read the USDC mint it was initialized with
    const config = await program.account.casinoConfig.fetch(casinoConfigPda);
    usdcMint = config.usdcMint;
    console.log("⚠️  CasinoConfig already exists, reusing existing USDC mint.");

    // Get the revenue token account (ATA)
    revenueTokenAccount = await getAssociatedTokenAddress(usdcMint, config.revenueWallet);
  } else {
    // Create new USDC mint and initialize
    usdcMint = await createMint(
      connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      USDC_DECIMALS,
    );
    log("USDC", `Mint created: ${usdcMint.toBase58()}`);

    const revenueWallet = adminKeypair.publicKey;
    revenueTokenAccount = await createAssociatedTokenAccount(
      connection,
      adminKeypair,
      usdcMint,
      revenueWallet,
    );

    const tx = await program.methods
      .initialize()
      .accounts({
        admin: adminKeypair.publicKey,
        casinoConfig: casinoConfigPda,
        usdcMint,
        revenueWallet,
        revenueTokenAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    log("Init", `CasinoConfig initialized. Tx: ${tx}`);
  }

  // Verify
  const config = await program.account.casinoConfig.fetch(casinoConfigPda);
  console.log(`    Admin:    ${config.admin.toBase58()}`);
  console.log(`    Revenue:  ${config.revenueWallet.toBase58()}`);
  console.log(`    USDC:     ${config.usdcMint.toBase58()}`);
  console.log(`    Rake:     ${config.rakeBps} bps (${config.rakeBps / 100}%)`);
  console.log(`    Min bet:  ${Number(config.minBetUsdc) / ONE_USDC} USDC`);
  console.log(`    Max bet:  ${Number(config.maxBetUsdc) / ONE_USDC} USDC`);
  console.log(`    Paused:   ${config.paused}`);
  console.log(`    Challenges: ${config.totalChallenges.toNumber()}`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 3: Create & fund test agents
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 3: Create & Fund Test Agents ───");

  const agentA = Keypair.generate();
  const agentB = Keypair.generate();

  // Fund agents via SOL transfer from admin (avoids airdrop rate limits)
  for (const [name, agent] of [["Agent A", agentA], ["Agent B", agentB]] as const) {
    await transferSol(connection, adminKeypair, agent.publicKey, LAMPORTS_PER_SOL / 5);
    log(name, `Funded with 0.2 SOL: ${agent.publicKey.toBase58()}`);
  }

  // Create USDC ATAs and mint test USDC
  const agentATokenAccount = await createAssociatedTokenAccount(
    connection, adminKeypair, usdcMint, agentA.publicKey,
  );
  const agentBTokenAccount = await createAssociatedTokenAccount(
    connection, adminKeypair, usdcMint, agentB.publicKey,
  );

  await mintTo(connection, adminKeypair, usdcMint, agentATokenAccount, adminKeypair.publicKey, 10_000 * ONE_USDC);
  await mintTo(connection, adminKeypair, usdcMint, agentBTokenAccount, adminKeypair.publicKey, 10_000 * ONE_USDC);
  log("USDC", "Minted 10,000 test USDC to each agent");

  // ════════════════════════════════════════════════════════════════════
  // STEP 4: Register agents (AI proof-of-work)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 4: Register Agents ───");

  for (const [name, agent] of [["Agent A", agentA], ["Agent B", agentB]] as const) {
    console.log(`    Mining AI proof for ${name}...`);
    const { nonce, hash } = findAiProof(agent.publicKey, 20);
    console.log(`    Found nonce: ${nonce} (${hash.slice(0, 4).toString("hex")}...)`);

    const [playerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), agent.publicKey.toBuffer()],
      program.programId,
    );

    const tx = await program.methods
      .registerAgent(new anchor.BN(nonce.toString()), Array.from(hash) as any)
      .accounts({
        agent: agent.publicKey,
        playerAccount: playerPda,
        casinoConfig: casinoConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([agent])
      .rpc();
    log(name, `Registered. Tx: ${tx}`);
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 5: Agent A creates a coinflip challenge (100 USDC)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 5: Create Coinflip Challenge ───");

  const betAmount = 100 * ONE_USDC;
  const configState = await program.account.casinoConfig.fetch(casinoConfigPda);
  const challengeId = configState.totalChallenges.toNumber();
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(BigInt(challengeId));

  const [challengePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), idBuffer],
    program.programId,
  );
  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), idBuffer],
    program.programId,
  );
  const vaultTokenAccount = Keypair.generate();

  const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), agentA.publicKey.toBuffer()],
    program.programId,
  );

  const gameParams = new Array(32).fill(0); // heads
  const randomnessSeed = Array.from(
    createHash("sha256").update(Buffer.from(`devnet-test-${Date.now()}`)).digest()
  );

  const tx1 = await program.methods
    .createChallenge(
      new anchor.BN(betAmount),
      { coinflip: {} },
      gameParams,
      randomnessSeed,
    )
    .accounts({
      creator: agentA.publicKey,
      creatorPlayer: creatorPlayerPda,
      casinoConfig: casinoConfigPda,
      challenge: challengePda,
      vaultAuthority: vaultAuthorityPda,
      vaultTokenAccount: vaultTokenAccount.publicKey,
      creatorTokenAccount: agentATokenAccount,
      usdcMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([agentA, vaultTokenAccount])
    .rpc();

  log("Challenge", `Created coinflip #${challengeId} for 100 USDC. Tx: ${tx1}`);

  const challenge = await program.account.challenge.fetch(challengePda);
  console.log(`    Status: ${JSON.stringify(challenge.status)}`);
  console.log(`    Creator: ${challenge.creator.toBase58()}`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 6: Agent B accepts the challenge
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 6: Accept Challenge ───");

  const [acceptorPlayerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), agentB.publicKey.toBuffer()],
    program.programId,
  );

  const tx2 = await program.methods
    .acceptChallenge()
    .accounts({
      acceptor: agentB.publicKey,
      acceptorPlayer: acceptorPlayerPda,
      challenge: challengePda,
      vaultTokenAccount: vaultTokenAccount.publicKey,
      acceptorTokenAccount: agentBTokenAccount,
      casinoConfig: casinoConfigPda,
      usdcMint,
    })
    .signers([agentB])
    .rpc();

  log("Accept", `Agent B accepted challenge #${challengeId}. Tx: ${tx2}`);

  const vaultBalance = await getAccount(connection, vaultTokenAccount.publicKey);
  console.log(`    Vault balance: ${Number(vaultBalance.amount) / ONE_USDC} USDC (2x bet)`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 7: Resolve the game
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 7: Resolve Game ───");

  const tx3 = await program.methods
    .resolveGame()
    .accounts({
      resolver: adminKeypair.publicKey,
      challenge: challengePda,
      creatorPlayer: creatorPlayerPda,
      acceptorPlayer: acceptorPlayerPda,
    })
    .rpc();

  log("Resolve", `Game resolved. Tx: ${tx3}`);

  const resolvedChallenge = await program.account.challenge.fetch(challengePda);
  const isCreatorWinner = resolvedChallenge.winner.toBase58() === agentA.publicKey.toBase58();
  console.log(`    Winner: ${isCreatorWinner ? "Agent A (creator)" : "Agent B (acceptor)"}`);
  console.log(`    Outcome: ${Buffer.from(resolvedChallenge.outcome as number[]).toString("hex").slice(0, 16)}...`);

  // ════════════════════════════════════════════════════════════════════
  // STEP 8: Winner claims winnings
  // ════════════════════════════════════════════════════════════════════
  console.log("\n─── Step 8: Claim Winnings ───");

  const winnerKeypair = isCreatorWinner ? agentA : agentB;
  const winnerTokenAcc = isCreatorWinner ? agentATokenAccount : agentBTokenAccount;

  // Compute skill answer
  const outcome = Buffer.from(resolvedChallenge.outcome as number[]);
  const skillAnswer = computeSkillAnswer(outcome, BigInt(challengeId));

  const winnerBalanceBefore = Number((await getAccount(connection, winnerTokenAcc)).amount);
  const revenueBalanceBefore = Number((await getAccount(connection, revenueTokenAccount)).amount);

  const tx4 = await program.methods
    .claimWinnings(Array.from(skillAnswer) as any)
    .accounts({
      winner: winnerKeypair.publicKey,
      challenge: challengePda,
      vaultAuthority: vaultAuthorityPda,
      vaultTokenAccount: vaultTokenAccount.publicKey,
      winnerTokenAccount: winnerTokenAcc,
      revenueTokenAccount,
      casinoConfig: casinoConfigPda,
      usdcMint,
    })
    .signers([winnerKeypair])
    .rpc();

  log("Claim", `Winnings claimed. Tx: ${tx4}`);

  const pot = betAmount * 2;
  const expectedRake = Math.floor(pot * 250 / 10_000);
  const expectedPayout = pot - expectedRake;

  const winnerBalanceAfter = Number((await getAccount(connection, winnerTokenAcc)).amount);
  const revenueBalanceAfter = Number((await getAccount(connection, revenueTokenAccount)).amount);
  const actualPayout = winnerBalanceAfter - winnerBalanceBefore;
  const actualRake = revenueBalanceAfter - revenueBalanceBefore;

  console.log(`    Payout:    ${actualPayout / ONE_USDC} USDC (expected: ${expectedPayout / ONE_USDC})`);
  console.log(`    Rake:      ${actualRake / ONE_USDC} USDC (expected: ${expectedRake / ONE_USDC})`);

  // Verify
  const claimedChallenge = await program.account.challenge.fetch(challengePda);
  console.log(`    Status:    ${JSON.stringify(claimedChallenge.status)}`);

  // ════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  DEVNET TEST COMPLETE — ALL STEPS PASSED");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Program ID:     ${PROGRAM_ID.toBase58()}`);
  console.log(`  Casino Config:  ${casinoConfigPda.toBase58()}`);
  console.log(`  USDC Mint:      ${usdcMint.toBase58()}`);
  console.log(`  Challenge #${challengeId}: Coinflip 100 USDC → ${isCreatorWinner ? "Creator" : "Acceptor"} won`);
  console.log(`  Payout: ${actualPayout / ONE_USDC} USDC | Rake: ${actualRake / ONE_USDC} USDC`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Save the USDC mint address for frontend use
  const envContent = `# Devnet test USDC mint (created by devnet-init-and-test.ts)
VITE_USDC_MINT=${usdcMint.toBase58()}
VITE_PROGRAM_ID=${PROGRAM_ID.toBase58()}
VITE_CASINO_CONFIG=${casinoConfigPda.toBase58()}
`;
  fs.writeFileSync(path.join(__dirname, "..", ".env"), envContent);
  console.log("📄 Saved .env with USDC mint and config addresses\n");
}

main().catch((err) => {
  console.error("\n❌ FAILED:", err);
  process.exit(1);
});
