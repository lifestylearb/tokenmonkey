import "dotenv/config";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getMint, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fetchMetadataFromSeeds,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";

// ─── Configuration ──────────────────────────────────────────────────────────

const TOKEN_DECIMALS = 9;
const EXPECTED_NAME = "TokenMonkey";
const EXPECTED_SYMBOL = "MNKY";
const EXPECTED_INITIAL_SUPPLY = 50_000_000_000n; // 50 billion tokens

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConnection(): Connection {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  return new Connection(rpcUrl, "confirmed");
}

function pass(label: string, detail: string) {
  console.log(`  [PASS] ${label}: ${detail}`);
}

function fail(label: string, detail: string) {
  console.log(`  [FAIL] ${label}: ${detail}`);
}

// ─── Main Verification ─────────────────────────────────────────────────────

async function main() {
  const mintAddress = process.argv[2];
  const ownerAddress = process.argv[3];

  if (!mintAddress) {
    console.error("Usage: ts-node verify.ts <MINT_ADDRESS> [OWNER_ADDRESS]");
    console.error("");
    console.error("  MINT_ADDRESS   - The SPL token mint address to verify");
    console.error("  OWNER_ADDRESS  - (Optional) The token holder address to check balance");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("  $MNKY Token Verification");
  console.log("=".repeat(60));
  console.log();

  const connection = getConnection();
  console.log(`RPC: ${connection.rpcEndpoint}`);
  console.log(`Mint: ${mintAddress}`);
  if (ownerAddress) {
    console.log(`Owner: ${ownerAddress}`);
  }
  console.log();

  let allPassed = true;

  // ── 1. Verify Mint Account ────────────────────────────────────────────────

  console.log("[1/4] Verifying mint account...");

  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(mintAddress);
  } catch {
    fail("Mint address", "Invalid public key format");
    process.exit(1);
  }

  let mintInfo;
  try {
    mintInfo = await getMint(connection, mintPubkey);
    pass("Mint exists", "Account found on-chain");
  } catch (err) {
    fail("Mint exists", "Mint account not found on-chain");
    process.exit(1);
  }

  // ── 2. Verify Decimals ────────────────────────────────────────────────────

  console.log();
  console.log("[2/4] Verifying token properties...");

  if (mintInfo.decimals === TOKEN_DECIMALS) {
    pass("Decimals", `${mintInfo.decimals}`);
  } else {
    fail("Decimals", `Expected ${TOKEN_DECIMALS}, got ${mintInfo.decimals}`);
    allPassed = false;
  }

  // Supply check
  const supplyTokens = mintInfo.supply / BigInt(10 ** TOKEN_DECIMALS);
  if (supplyTokens === EXPECTED_INITIAL_SUPPLY) {
    pass("Supply", `${supplyTokens.toLocaleString()} tokens`);
  } else {
    fail(
      "Supply",
      `Expected ${EXPECTED_INITIAL_SUPPLY.toLocaleString()}, got ${supplyTokens.toLocaleString()}`
    );
    allPassed = false;
  }

  // Mint authority
  if (mintInfo.mintAuthority) {
    pass("Mint authority", mintInfo.mintAuthority.toBase58());
  } else {
    console.log(
      "  [INFO] Mint authority: REVOKED (no further minting possible)"
    );
  }

  // Freeze authority
  if (mintInfo.freezeAuthority) {
    pass("Freeze authority", mintInfo.freezeAuthority.toBase58());
  } else {
    console.log("  [INFO] Freeze authority: REVOKED");
  }

  // ── 3. Verify Metadata ────────────────────────────────────────────────────

  console.log();
  console.log("[3/4] Verifying token metadata...");

  try {
    const umi = createUmi(connection.rpcEndpoint);
    const metadata = await fetchMetadataFromSeeds(umi, {
      mint: umiPublicKey(mintAddress),
    });

    // Name check (metadata name is padded with null bytes)
    const metadataName = metadata.name.replace(/\0/g, "").trim();
    if (metadataName === EXPECTED_NAME) {
      pass("Name", metadataName);
    } else {
      fail("Name", `Expected "${EXPECTED_NAME}", got "${metadataName}"`);
      allPassed = false;
    }

    // Symbol check
    const metadataSymbol = metadata.symbol.replace(/\0/g, "").trim();
    if (metadataSymbol === EXPECTED_SYMBOL) {
      pass("Symbol", metadataSymbol);
    } else {
      fail(
        "Symbol",
        `Expected "${EXPECTED_SYMBOL}", got "${metadataSymbol}"`
      );
      allPassed = false;
    }

    // URI
    const metadataUri = metadata.uri.replace(/\0/g, "").trim();
    if (metadataUri.length > 0) {
      pass("URI", metadataUri);
    } else {
      fail("URI", "Empty metadata URI");
      allPassed = false;
    }

    // Seller fee
    pass("Seller fee", `${metadata.sellerFeeBasisPoints} bps`);

    // Mutability
    console.log(
      `  [INFO] Mutable: ${metadata.isMutable ? "Yes" : "No"}`
    );

    // Update authority
    if (metadata.updateAuthority) {
      pass("Update authority", metadata.updateAuthority.toString());
    }
  } catch (err) {
    fail(
      "Metadata",
      "Could not fetch metadata. It may not have been created yet."
    );
    allPassed = false;
  }

  // ── 4. Verify Token Account (optional) ───────────────────────────────────

  console.log();
  console.log("[4/4] Verifying token account...");

  if (ownerAddress) {
    try {
      const ownerPubkey = new PublicKey(ownerAddress);
      const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);

      try {
        const accountInfo = await getAccount(connection, ata);
        const accountBalance =
          Number(accountInfo.amount) / Math.pow(10, TOKEN_DECIMALS);
        pass("ATA address", ata.toBase58());
        pass("Balance", `${accountBalance.toLocaleString()} MNKY`);
      } catch {
        fail(
          "Token account",
          `No associated token account found for ${ownerAddress}`
        );
        allPassed = false;
      }
    } catch {
      fail("Owner address", "Invalid public key format");
      allPassed = false;
    }
  } else {
    console.log(
      "  [SKIP] No owner address provided. Pass as second argument to check balance."
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log();
  console.log("=".repeat(60));
  if (allPassed) {
    console.log("  All checks PASSED");
  } else {
    console.log("  Some checks FAILED - review output above");
  }
  console.log("=".repeat(60));
  console.log();
  console.log(
    `  Solscan:   https://solscan.io/token/${mintAddress}`
  );
  console.log(
    `  Explorer:  https://explorer.solana.com/address/${mintAddress}`
  );
  console.log();

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
