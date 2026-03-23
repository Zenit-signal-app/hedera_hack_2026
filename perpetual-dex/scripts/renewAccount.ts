/**
 * Renew Hedera account expiry using Hedera SDK
 *
 * Usage:
 *   npx tsx scripts/renewAccount.ts
 */
import {
  Client,
  AccountId,
  PrivateKey,
  AccountUpdateTransaction,
  Timestamp,
} from "@hashgraph/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from frontend directory
dotenv.config({ path: path.join(__dirname, "../frontend/.env") });

async function main() {
  const privateKeyHex = process.env.HEDERA_MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!privateKeyHex) {
    throw new Error("HEDERA_MAINNET_PRIVATE_KEY or PRIVATE_KEY not found in .env");
  }

  // Remove 0x prefix if present
  const cleanKey = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const privateKey = PrivateKey.fromStringECDSA(cleanKey);

  // Use the correct Hedera account ID (from Mirror API diagnostic)
  const accountId = AccountId.fromString("0.0.9451398");
  const evmAddress = "0x539425c9d4a66A2aCe88DEA7533aC775df4E40E2";

  console.log("=== Hedera Account Renewal ===");
  console.log("Account ID:", accountId.toString());
  console.log("EVM Address:", evmAddress);
  console.log("");

  // Create client for mainnet
  const client = Client.forMainnet();
  client.setOperator(accountId, privateKey);

  try {
    // Set new expiry to 90 days from now
    const newExpiry = Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

    console.log("Current time:", new Date().toISOString());
    console.log("New expiry:", newExpiry.toDate().toISOString());
    console.log("");
    console.log("Submitting AccountUpdateTransaction...");

    const transaction = await new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setExpirationTime(newExpiry)
      .freezeWith(client);

    const signedTx = await transaction.sign(privateKey);
    const txResponse = await signedTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log("✅ Account renewed successfully!");
    console.log("Transaction ID:", txResponse.transactionId.toString());
    console.log("Status:", receipt.status.toString());
    console.log("New expiry:", newExpiry.toDate().toISOString());
    console.log("");
    console.log("You can now test the 10 HBAR swap on the Aggregate page.");

  } catch (error) {
    console.error("❌ Failed to renew account:");
    if (error instanceof Error) {
      console.error(error.message);

      // Check if it's an authorization issue
      if (error.message.includes("INVALID_SIGNATURE") || error.message.includes("UNAUTHORIZED")) {
        console.error("\nThe private key may not have permission to update this account.");
        console.error("Please use HashPack wallet or Hedera Portal to renew the account:");
        console.error("- HashPack: Open wallet → Account → Extend expiry");
        console.error("- Portal: https://portal.hedera.com");
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    client.close();
  }
}

main().catch(console.error);
