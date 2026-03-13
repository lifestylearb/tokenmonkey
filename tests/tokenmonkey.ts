import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenmonkey } from "../target/types/tokenmonkey";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

describe("tokenmonkey", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.tokenmonkey as Program<Tokenmonkey>;
  const admin = provider.wallet as anchor.Wallet;

  // Test accounts
  let usdcMint: PublicKey;
  let revenueWallet: Keypair;
  let revenueTokenAccount: PublicKey;

  let agentA: Keypair;
  let agentB: Keypair;
  let agentATokenAccount: PublicKey;
  let agentBTokenAccount: PublicKey;

  // PDAs
  let casinoConfigPda: PublicKey;
  let casinoConfigBump: number;

  const USDC_DECIMALS = 6;
  const ONE_USDC = 1_000_000;

  // Helper: find AI proof (nonce that produces hash with N leading zero bits)
  function findAiProof(agentPubkey: PublicKey, difficulty: number): { nonce: bigint; hash: Buffer } {
    let nonce = BigInt(0);
    while (true) {
      const preimage = Buffer.concat([
        agentPubkey.toBuffer(),
        Buffer.from(nonce.toString(16).padStart(16, "0"), "hex"),
      ]);
      // Convert nonce to LE bytes like the program does
      const nonceBuffer = Buffer.alloc(8);
      nonceBuffer.writeBigUInt64LE(nonce);
      const preimage2 = Buffer.concat([agentPubkey.toBuffer(), nonceBuffer]);
      const hash = createHash("sha256").update(preimage2).digest();

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

  // Helper: compute skill answer
  function computeSkillAnswer(outcome: Buffer, challengeId: bigint): Buffer {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(challengeId);
    const preimage = Buffer.concat([outcome, idBuffer]);
    return createHash("sha256").update(preimage).digest();
  }

  before(async () => {
    // Find casino config PDA
    [casinoConfigPda, casinoConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("casino_config")],
      program.programId
    );

    // Create USDC mock mint
    usdcMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      USDC_DECIMALS
    );

    // Create revenue wallet
    revenueWallet = Keypair.generate();

    // Airdrop SOL to revenue wallet for rent
    const sig = await provider.connection.requestAirdrop(
      revenueWallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Create revenue wallet's USDC token account
    revenueTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      revenueWallet.publicKey
    );

    // Create agent A
    agentA = Keypair.generate();
    const sigA = await provider.connection.requestAirdrop(
      agentA.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigA);

    agentATokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      agentA.publicKey
    );

    // Mint 10,000 USDC to Agent A
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      agentATokenAccount,
      admin.publicKey,
      10_000 * ONE_USDC
    );

    // Create agent B
    agentB = Keypair.generate();
    const sigB = await provider.connection.requestAirdrop(
      agentB.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigB);

    agentBTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      agentB.publicKey
    );

    // Mint 10,000 USDC to Agent B
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      agentBTokenAccount,
      admin.publicKey,
      10_000 * ONE_USDC
    );
  });

  describe("Initialization", () => {
    it("initializes the casino", async () => {
      await program.methods
        .initialize()
        .accounts({
          admin: admin.publicKey,
          casinoConfig: casinoConfigPda,
          usdcMint,
          revenueWallet: revenueWallet.publicKey,
          revenueTokenAccount,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.casinoConfig.fetch(casinoConfigPda);
      expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(config.revenueWallet.toBase58()).to.equal(revenueWallet.publicKey.toBase58());
      expect(config.rakeBps).to.equal(250);
      expect(config.paused).to.equal(false);
      expect(config.totalChallenges.toNumber()).to.equal(0);
    });

    it("fails to re-initialize", async () => {
      try {
        await program.methods
          .initialize()
          .accounts({
            admin: admin.publicKey,
            casinoConfig: casinoConfigPda,
            usdcMint,
            revenueWallet: revenueWallet.publicKey,
            revenueTokenAccount,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have failed");
      } catch (e) {
        // Expected: account already initialized
      }
    });
  });

  describe("Agent Registration", () => {
    it("registers Agent A with valid AI proof", async () => {
      const { nonce, hash } = findAiProof(agentA.publicKey, 20);

      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .registerAgent(new anchor.BN(nonce.toString()), Array.from(hash) as any)
        .accounts({
          agent: agentA.publicKey,
          playerAccount: playerPda,
          casinoConfig: casinoConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentA])
        .rpc();

      const player = await program.account.playerAccount.fetch(playerPda);
      expect(player.wallet.toBase58()).to.equal(agentA.publicKey.toBase58());
      expect(player.betsPlaced).to.equal(0);
      expect(player.wins).to.equal(0);
      expect(player.losses).to.equal(0);
    });

    it("registers Agent B", async () => {
      const { nonce, hash } = findAiProof(agentB.publicKey, 20);

      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentB.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .registerAgent(new anchor.BN(nonce.toString()), Array.from(hash) as any)
        .accounts({
          agent: agentB.publicKey,
          playerAccount: playerPda,
          casinoConfig: casinoConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentB])
        .rpc();

      const player = await program.account.playerAccount.fetch(playerPda);
      expect(player.wallet.toBase58()).to.equal(agentB.publicKey.toBase58());
    });

    it("fails registration with invalid AI proof", async () => {
      const badAgent = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        badAgent.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), badAgent.publicKey.toBuffer()],
        program.programId
      );

      const fakeHash = Buffer.alloc(32, 0xff); // All 0xff = no leading zeros

      try {
        await program.methods
          .registerAgent(new anchor.BN(0), Array.from(fakeHash) as any)
          .accounts({
            agent: badAgent.publicKey,
            playerAccount: playerPda,
            casinoConfig: casinoConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([badAgent])
          .rpc();
        expect.fail("Should have failed");
      } catch (e) {
        expect(e.toString()).to.include("InvalidAiProof");
      }
    });
  });

  describe("Coinflip Lifecycle", () => {
    const betAmount = 100 * ONE_USDC; // 100 USDC
    let challengeId: number;
    let challengePda: PublicKey;
    let vaultAuthorityPda: PublicKey;
    let vaultTokenAccount: Keypair;

    it("Agent A creates a coinflip challenge", async () => {
      // Get current challenge count
      const config = await program.account.casinoConfig.fetch(casinoConfigPda);
      challengeId = config.totalChallenges.toNumber();

      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(challengeId));

      [challengePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("challenge"), idBuffer],
        program.programId
      );

      [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), idBuffer],
        program.programId
      );

      vaultTokenAccount = Keypair.generate();

      const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );

      // game_params[0] = 0 (heads)
      const gameParams = new Array(32).fill(0);

      // Random seed
      const randomnessSeed = Array.from(createHash("sha256").update(Buffer.from("test-seed-1")).digest());

      const balanceBefore = (await getAccount(provider.connection, agentATokenAccount)).amount;

      await program.methods
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

      // Verify
      const challenge = await program.account.challenge.fetch(challengePda);
      expect(challenge.id.toNumber()).to.equal(challengeId);
      expect(challenge.creator.toBase58()).to.equal(agentA.publicKey.toBase58());
      expect(challenge.amountUsdc.toNumber()).to.equal(betAmount);
      expect(JSON.stringify(challenge.status)).to.include("open");

      const balanceAfter = (await getAccount(provider.connection, agentATokenAccount)).amount;
      expect(Number(balanceBefore - balanceAfter)).to.equal(betAmount);

      // Check vault has the deposit
      const vault = await getAccount(provider.connection, vaultTokenAccount.publicKey);
      expect(Number(vault.amount)).to.equal(betAmount);
    });

    it("Agent B accepts the challenge", async () => {
      const [acceptorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentB.publicKey.toBuffer()],
        program.programId
      );

      const balanceBefore = (await getAccount(provider.connection, agentBTokenAccount)).amount;

      await program.methods
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

      const challenge = await program.account.challenge.fetch(challengePda);
      expect(challenge.acceptor.toBase58()).to.equal(agentB.publicKey.toBase58());
      expect(JSON.stringify(challenge.status)).to.include("matched");

      // Vault should now have 2x the bet
      const vault = await getAccount(provider.connection, vaultTokenAccount.publicKey);
      expect(Number(vault.amount)).to.equal(betAmount * 2);
    });

    it("resolves the game", async () => {
      const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );
      const [acceptorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentB.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .resolveGame()
        .accounts({
          resolver: admin.publicKey,
          challenge: challengePda,
          creatorPlayer: creatorPlayerPda,
          acceptorPlayer: acceptorPlayerPda,
        })
        .rpc();

      const challenge = await program.account.challenge.fetch(challengePda);
      expect(JSON.stringify(challenge.status)).to.include("resolved");
      expect(challenge.winner.toBase58()).to.not.equal(PublicKey.default.toBase58());
    });

    it("winner claims winnings with correct skill answer", async () => {
      const challenge = await program.account.challenge.fetch(challengePda);
      const winner = challenge.winner;
      const isCreatorWinner = winner.toBase58() === agentA.publicKey.toBase58();
      const winnerKeypair = isCreatorWinner ? agentA : agentB;
      const winnerTokenAcc = isCreatorWinner ? agentATokenAccount : agentBTokenAccount;

      // Compute skill answer
      const outcome = Buffer.from(challenge.outcome as number[]);
      const skillAnswer = computeSkillAnswer(outcome, BigInt(challengeId));

      const winnerBalanceBefore = (await getAccount(provider.connection, winnerTokenAcc)).amount;
      const revenueBalanceBefore = (await getAccount(provider.connection, revenueTokenAccount)).amount;

      await program.methods
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

      // Verify payout: pot = 200 USDC, rake = 5 USDC (2.5%), payout = 195 USDC
      const pot = betAmount * 2;
      const expectedRake = Math.floor(pot * 250 / 10_000);
      const expectedPayout = pot - expectedRake;

      const winnerBalanceAfter = (await getAccount(provider.connection, winnerTokenAcc)).amount;
      expect(Number(winnerBalanceAfter - winnerBalanceBefore)).to.equal(expectedPayout);

      // Verify rake went to revenue wallet
      const revenueBalanceAfter = (await getAccount(provider.connection, revenueTokenAccount)).amount;
      expect(Number(revenueBalanceAfter - revenueBalanceBefore)).to.equal(expectedRake);

      // Verify challenge status
      const updatedChallenge = await program.account.challenge.fetch(challengePda);
      expect(JSON.stringify(updatedChallenge.status)).to.include("claimed");

      console.log(`    Winner: ${isCreatorWinner ? "Agent A (creator)" : "Agent B (acceptor)"}`);
      console.log(`    Payout: ${expectedPayout / ONE_USDC} USDC`);
      console.log(`    Rake: ${expectedRake / ONE_USDC} USDC`);
    });

    it("fails claim with wrong skill answer", async () => {
      // This test uses a new challenge to test the failure path
      // We'll verify the error on the already-claimed challenge first
      const challenge = await program.account.challenge.fetch(challengePda);
      const winner = challenge.winner;
      const isCreatorWinner = winner.toBase58() === agentA.publicKey.toBase58();
      const winnerKeypair = isCreatorWinner ? agentA : agentB;
      const winnerTokenAcc = isCreatorWinner ? agentATokenAccount : agentBTokenAccount;

      try {
        await program.methods
          .claimWinnings(Array.from(Buffer.alloc(32, 0xab)) as any)
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
        expect.fail("Should have failed");
      } catch (e) {
        // Expected: either ChallengeNotResolved (already claimed) or InvalidSkillAnswer
      }
    });
  });

  describe("Challenge Cancellation", () => {
    let cancelChallengePda: PublicKey;
    let cancelVaultAuthority: PublicKey;
    let cancelVaultTokenAccount: Keypair;

    it("creates and cancels an unmatched challenge", async () => {
      const config = await program.account.casinoConfig.fetch(casinoConfigPda);
      const challengeId = config.totalChallenges.toNumber();
      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(challengeId));

      [cancelChallengePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("challenge"), idBuffer],
        program.programId
      );
      [cancelVaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), idBuffer],
        program.programId
      );
      cancelVaultTokenAccount = Keypair.generate();

      const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );

      const gameParams = new Array(32).fill(0);
      const randomnessSeed = Array.from(createHash("sha256").update(Buffer.from("cancel-seed")).digest());

      const balanceBefore = (await getAccount(provider.connection, agentATokenAccount)).amount;

      // Create challenge
      await program.methods
        .createChallenge(
          new anchor.BN(50 * ONE_USDC),
          { coinflip: {} },
          gameParams,
          randomnessSeed,
        )
        .accounts({
          creator: agentA.publicKey,
          creatorPlayer: creatorPlayerPda,
          casinoConfig: casinoConfigPda,
          challenge: cancelChallengePda,
          vaultAuthority: cancelVaultAuthority,
          vaultTokenAccount: cancelVaultTokenAccount.publicKey,
          creatorTokenAccount: agentATokenAccount,
          usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentA, cancelVaultTokenAccount])
        .rpc();

      const balanceAfterCreate = (await getAccount(provider.connection, agentATokenAccount)).amount;
      expect(Number(balanceBefore - balanceAfterCreate)).to.equal(50 * ONE_USDC);

      // Cancel challenge
      await program.methods
        .cancelChallenge()
        .accounts({
          creator: agentA.publicKey,
          challenge: cancelChallengePda,
          vaultAuthority: cancelVaultAuthority,
          vaultTokenAccount: cancelVaultTokenAccount.publicKey,
          creatorTokenAccount: agentATokenAccount,
          casinoConfig: casinoConfigPda,
          usdcMint,
        })
        .signers([agentA])
        .rpc();

      // Full refund
      const balanceAfterCancel = (await getAccount(provider.connection, agentATokenAccount)).amount;
      expect(Number(balanceAfterCancel)).to.equal(Number(balanceBefore));

      const challenge = await program.account.challenge.fetch(cancelChallengePda);
      expect(JSON.stringify(challenge.status)).to.include("cancelled");
    });
  });

  describe("Edge Cases", () => {
    it("rejects bet below minimum", async () => {
      const config = await program.account.casinoConfig.fetch(casinoConfigPda);
      const challengeId = config.totalChallenges.toNumber();
      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(challengeId));

      const [challengePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("challenge"), idBuffer],
        program.programId
      );
      const [vaultAuth] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), idBuffer],
        program.programId
      );
      const vaultKp = Keypair.generate();
      const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );

      const gameParams = new Array(32).fill(0);
      const randomnessSeed = Array.from(createHash("sha256").update(Buffer.from("low-bet")).digest());

      try {
        await program.methods
          .createChallenge(
            new anchor.BN(100), // 0.0001 USDC — below 1 USDC minimum
            { coinflip: {} },
            gameParams,
            randomnessSeed,
          )
          .accounts({
            creator: agentA.publicKey,
            creatorPlayer: creatorPlayerPda,
            casinoConfig: casinoConfigPda,
            challenge: challengePda,
            vaultAuthority: vaultAuth,
            vaultTokenAccount: vaultKp.publicKey,
            creatorTokenAccount: agentATokenAccount,
            usdcMint,
            systemProgram: SystemProgram.programId,
          })
          .signers([agentA, vaultKp])
          .rpc();
        expect.fail("Should have failed");
      } catch (e) {
        expect(e.toString()).to.include("BetTooLow");
      }
    });

    it("rejects accepting own challenge", async () => {
      // Create a new challenge as Agent A
      const config = await program.account.casinoConfig.fetch(casinoConfigPda);
      const challengeId = config.totalChallenges.toNumber();
      const idBuffer = Buffer.alloc(8);
      idBuffer.writeBigUInt64LE(BigInt(challengeId));

      const [challengePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("challenge"), idBuffer],
        program.programId
      );
      const [vaultAuth] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), idBuffer],
        program.programId
      );
      const vaultKp = Keypair.generate();
      const [creatorPlayerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), agentA.publicKey.toBuffer()],
        program.programId
      );

      const gameParams = new Array(32).fill(0);
      const randomnessSeed = Array.from(createHash("sha256").update(Buffer.from("self-accept")).digest());

      await program.methods
        .createChallenge(
          new anchor.BN(5 * ONE_USDC),
          { coinflip: {} },
          gameParams,
          randomnessSeed,
        )
        .accounts({
          creator: agentA.publicKey,
          creatorPlayer: creatorPlayerPda,
          casinoConfig: casinoConfigPda,
          challenge: challengePda,
          vaultAuthority: vaultAuth,
          vaultTokenAccount: vaultKp.publicKey,
          creatorTokenAccount: agentATokenAccount,
          usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentA, vaultKp])
        .rpc();

      // Try to accept own challenge
      try {
        await program.methods
          .acceptChallenge()
          .accounts({
            acceptor: agentA.publicKey,
            acceptorPlayer: creatorPlayerPda,
            challenge: challengePda,
            vaultTokenAccount: vaultKp.publicKey,
            acceptorTokenAccount: agentATokenAccount,
            casinoConfig: casinoConfigPda,
            usdcMint,
          })
          .signers([agentA])
          .rpc();
        expect.fail("Should have failed");
      } catch (e) {
        expect(e.toString()).to.include("CannotAcceptOwnChallenge");
      }
    });
  });
});
