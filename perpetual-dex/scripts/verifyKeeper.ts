import { ethers } from "hardhat";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "keeper/.env" });
loadEnv({ path: "frontend/.env" });

/**
 * Verify keeper is authorized on the PerpetualDEX contract.
 * Run: npx hardhat run scripts/verifyKeeper.ts --network polkadotTestnet
 */
async function main() {
  const dexAddress =
    process.env.DEX_ADDRESS ||
    process.env.VITE_PERP_DEX_ADDRESS ||
    process.env.VITE_DEX_ADDRESS;
  if (!dexAddress) {
    throw new Error("DEX_ADDRESS or VITE_PERP_DEX_ADDRESS required");
  }

  const keeperKey = process.env.KEEPER_PRIVATE_KEY?.trim();
  if (!keeperKey) {
    throw new Error("KEEPER_PRIVATE_KEY required (from keeper/.env)");
  }

  const keeperWallet = new ethers.Wallet(keeperKey);
  const keeperAddress = keeperWallet.address;

  const dex = await ethers.getContractAt(
    ["function keeperAddress() view returns (address)"],
    dexAddress,
  );
  const contractKeeper = (await dex.keeperAddress()) as string;

  console.log("DEX contract:", dexAddress);
  console.log("Keeper wallet:", keeperAddress);
  console.log("Contract keeper:", contractKeeper);
  console.log("Authorized:", contractKeeper.toLowerCase() === keeperAddress.toLowerCase());

  if (contractKeeper === ethers.ZeroAddress) {
    console.log("\n⚠ Keeper NOT set on contract. Run:");
    console.log("  npx hardhat run scripts/setKeeper.ts --network polkadotTestnet");
    process.exitCode = 1;
  } else if (contractKeeper.toLowerCase() !== keeperAddress.toLowerCase()) {
    console.log("\n⚠ Keeper address mismatch. Update with setKeeper.ts");
    process.exitCode = 1;
  } else {
    console.log("\n✓ Keeper is authorized.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
