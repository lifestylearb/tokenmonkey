import "dotenv/config";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
  getAccount,
} from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createMetadataAccountV3,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  publicKey as umiPublicKey,
  signerIdentity,
  createSignerFromKeypair as umiCreateSignerFromKeypair,
} from "@metaplex-foundation/umi";

// ─── Token Configuration ────────────────────────────────────────────────────

const TOKEN_NAME = "TokenMonkey";
const TOKEN_SYMBOL = "MNKY";
const TOKEN_DECIMALS = 9;
const MAX_SUPPLY = 100_000_000_000n; // 100 billion
const INITIAL_MINT = 50_000_000_000n; // 50 billion
const METADATA_URI =
  process.env.TOKEN_METADATA_URI || "https://tokenmonkey.io/metadata.json";

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(): Keypair {
  const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyEnv) {
    throw new Error(
      "SOLANA_PRIVATE_KEY is not set. Provide a JSON byte-array of your private key."
    );
  }

  let secretKey: Uint8Array;
  try {
    const parsed = JSON.parse(privateKeyEnv);
    secretKey = Uint8Array.from(parsed);
  } catch {
    throw new Error(
      "SOLANA_PRIVATE_KEY must be a valid JSON array of bytes, e.g. [12,34,56,...]"
    );
  }

  return Keypair.fromSecretKey(secretKey);
}

function getConnection(): Connection {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  return new Connection(rpcUrl, "confirmed");
}

// ─── Main Deployment ────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  $MNKY Token Deployment - TokenMonkey Casino");
  console.log("=".repeat(60));
  console.log();

  // 1. Load deployer wallet
  const deployer = loadKeypair();
  const connection = getConnection();

  console.log(`Deployer:    ${deployer.publicKey.toBase58()}`);
  console.log(`RPC:         ${connection.rpcEndpoint}`);
  console.log();

  // Check deployer balance
  const balance = await connection.getBalance(deployer.publicKey);
  const solBalance = balance / 1e9;
  console.log(`Balance:     ${solBalance.toFixed(4)} SOL`);

  if (solBalance < 0.05) {
    throw new Error(
      `Insufficient SOL balance (${solBalance} SOL). Need at least 0.05 SOL for deployment.`
    );
  }
  console.log();

  // 2. Create the mint account
  console.log("[1/4] Creating mint account...");
  const mint = await createMint(
    connection,
    deployer, // payer
    deployer.publicKey, // mint authority
    deployer.publicKey, // freeze authority (set to deployer; can be revoked later)
    TOKEN_DECIMALS // decimals
  );
  console.log(`  Mint address: ${mint.toBase58()}`);
  console.log();

  // 3. Create associated token account for deployer
  console.log("[2/4] Creating associated token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer, // payer
    mint, // mint
    deployer.publicKey // owner
  );
  console.log(`  Token account: ${tokenAccount.address.toBase58()}`);
  console.log();

  // 4. Mint initial supply
  console.log("[3/4] Minting initial supply...");
  const mintAmount = INITIAL_MINT * BigInt(10 ** TOKEN_DECIMALS);
  console.log(
    `  Amount: ${INITIAL_MINT.toLocaleString()} tokens (${mintAmount.toString()} raw)`
  );

  const mintTxSig = await mintTo(
    connection,
    deployer, // payer
    mint, // mint
    tokenAccount.address, // destination
    deployer, // authority
    mintAmount // amount in smallest unit
  );
  console.log(`  Mint tx: ${mintTxSig}`);
  console.log();

  // 5. Create token metadata via Metaplex
  console.log("[4/4] Creating token metadata...");
  const umi = createUmi(connection.rpcEndpoint);

  // Convert the deployer keypair to a UMI signer
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(deployer.secretKey);
  const umiSigner = umiCreateSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(umiSigner));

  const metadataPda = findMetadataPda(umi, {
    mint: umiPublicKey(mint.toBase58()),
  });

  const metadataTx = createMetadataAccountV3(umi, {
    metadata: metadataPda,
    mint: umiPublicKey(mint.toBase58()),
    mintAuthority: umiSigner,
    payer: umiSigner,
    updateAuthority: umiSigner.publicKey,
    data: {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: METADATA_URI,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  });

  await metadataTx.sendAndConfirm(umi);
  console.log(`  Metadata PDA: ${metadataPda[0]}`);
  console.log();

  // ─── Summary ──────────────────────────────────────────────────────────────

  // Verify final state
  const mintInfo = await getMint(connection, mint);
  const accountInfo = await getAccount(connection, tokenAccount.address);

  console.log("=".repeat(60));
  console.log("  Deployment Summary");
  console.log("=".repeat(60));
  console.log();
  console.log(`  Token Name:       ${TOKEN_NAME}`);
  console.log(`  Token Symbol:     ${TOKEN_SYMBOL}`);
  console.log(`  Decimals:         ${TOKEN_DECIMALS}`);
  console.log(`  Mint Address:     ${mint.toBase58()}`);
  console.log(`  Metadata URI:     ${METADATA_URI}`);
  console.log(`  Mint Authority:   ${mintInfo.mintAuthority?.toBase58()}`);
  console.log(`  Freeze Authority: ${mintInfo.freezeAuthority?.toBase58()}`);
  console.log(
    `  Total Supply:     ${(
      Number(mintInfo.supply) / Math.pow(10, TOKEN_DECIMALS)
    ).toLocaleString()} ${TOKEN_SYMBOL}`
  );
  console.log(
    `  Max Supply:       ${MAX_SUPPLY.toLocaleString()} ${TOKEN_SYMBOL} (enforced off-chain)`
  );
  console.log(`  Token Account:    ${tokenAccount.address.toBase58()}`);
  console.log(
    `  Account Balance:  ${(
      Number(accountInfo.amount) / Math.pow(10, TOKEN_DECIMALS)
    ).toLocaleString()} ${TOKEN_SYMBOL}`
  );
  console.log();
  console.log(
    `  View on Solscan:  https://solscan.io/token/${mint.toBase58()}`
  );
  console.log(
    `  View on Explorer: https://explorer.solana.com/address/${mint.toBase58()}`
  );
  console.log();
  console.log("Deployment complete!");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
