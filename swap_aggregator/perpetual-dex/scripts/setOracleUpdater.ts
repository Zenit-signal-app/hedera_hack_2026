import { ethers } from "hardhat";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "frontend/.env" });
loadEnv({ path: "keeper/.env" });

/**
 * Set the updater address on ZenitOracle.
 * Run: npx hardhat run scripts/setOracleUpdater.ts --network polkadotTestnet
 *
 * Requires in env:
 * - ORACLE_ADDRESS or VITE_ORACLE_ADDRESS
 * - ORACLE_PRIVATE_KEY (preferred updater wallet), fallback KEEPER_PRIVATE_KEY
 * - PRIVATE_KEY (owner key - must be oracle owner)
 */
async function main() {
  const oracleAddress =
    process.env.ORACLE_ADDRESS ||
    process.env.VITE_ORACLE_ADDRESS;
  if (!oracleAddress) throw new Error("ORACLE_ADDRESS or VITE_ORACLE_ADDRESS required");

  const updaterKey = process.env.ORACLE_PRIVATE_KEY?.trim() || process.env.KEEPER_PRIVATE_KEY?.trim();
  if (!updaterKey) throw new Error("ORACLE_PRIVATE_KEY or KEEPER_PRIVATE_KEY required");
  const updaterAddress = new ethers.Wallet(updaterKey).address;

  console.log("Oracle:", oracleAddress);
  console.log("Updater address:", updaterAddress);

  const oracle = await ethers.getContractAt("ZenitOracle", oracleAddress);
  const current = await oracle.updater();
  if (String(current).toLowerCase() === updaterAddress.toLowerCase()) {
    console.log("Updater already set. No change.");
    return;
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1000", "gwei");
  const tx = await oracle.setUpdater(updaterAddress, {
    type: 0,
    gasPrice,
    gasLimit: 1_000_000n,
  });
  await tx.wait();
  console.log("setUpdater tx:", tx.hash);
  console.log("Updater set successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

