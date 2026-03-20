import { ethers } from "hardhat";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "frontend/.env" });
loadEnv({ path: "keeper/.env" });

/**
 * Set the keeper address on the PerpetualDEX contract.
 * Run: npx hardhat run scripts/setKeeper.ts --network polkadotTestnet
 *
 * Requires in .env:
 *   DEX_ADDRESS or VITE_PERP_DEX_ADDRESS - the PerpetualDEX contract address
 *   KEEPER_PRIVATE_KEY - the keeper wallet private key (address will be derived)
 *   PRIVATE_KEY - owner's key to sign the tx (must be contract owner)
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
    throw new Error("KEEPER_PRIVATE_KEY required");
  }

  const keeperWallet = new ethers.Wallet(keeperKey);
  const keeperAddress = keeperWallet.address;

  console.log("DEX contract:", dexAddress);
  console.log("Keeper address:", keeperAddress);

  const dex = await ethers.getContractAt("PerpetualDEX", dexAddress);
  const current = await dex.keeperAddress();
  if (current === keeperAddress) {
    console.log("Keeper address already set. No change.");
    return;
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1000", "gwei");
  const tx = await dex.setKeeperAddress(keeperAddress, {
    type: 0,
    gasPrice,
    gasLimit: 1_000_000n,
  });
  await tx.wait();
  console.log("setKeeperAddress tx:", tx.hash);
  console.log("Keeper address set successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
