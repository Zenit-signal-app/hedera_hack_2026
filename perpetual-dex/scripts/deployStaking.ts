/**
 * Deploy ZUSDCStaking (stake zUSDC, earn zUSDC).
 *
 * Env (same as deploy):
 * - HEDERA_TESTNET_RPC_URL / PRIVATE_KEY
 * - TOKEN_ADDRESS or read from frontend .env via dotenv in hardhat
 *
 * Optional:
 * - STAKING_REWARDS_DURATION_SECONDS (default: 90 days)
 *
 * After deploy, fund rewards (100k zUSDC) with:
 *   npx hardhat run scripts/fundStakingRewards.ts --network hederaTestnet
 */
import { ethers } from "hardhat";

async function main() {
  const token =
    process.env.TOKEN_ADDRESS?.trim() ||
    process.env.VITE_TOKEN_ADDRESS?.trim() ||
    process.env.zUSDC_Smartcontract?.trim();
  if (!token) {
    throw new Error("Set TOKEN_ADDRESS or VITE_TOKEN_ADDRESS (zUSDC EVM address)");
  }

  const durationSec = Number(process.env.STAKING_REWARDS_DURATION_SECONDS ?? 90 * 24 * 60 * 60);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error("Invalid STAKING_REWARDS_DURATION_SECONDS");
  }

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Deployer HBAR (wei):", bal.toString(), `(${ethers.formatEther(bal)} HBAR)`);
  if (bal === 0n) {
    console.warn(
      "Balance is 0 — nạp HBAR testnet cho ví deployer (faucet). Không đủ phí → INSUFFICIENT_TX_FEE.",
    );
  }
  console.log("Staking token / reward token:", token);
  console.log("Rewards duration (seconds):", durationSec);

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("50", "gwei");
  console.log("Using gasPrice (wei):", gasPrice.toString());

  const Factory = await ethers.getContractFactory("ZUSDCStaking");
  const staking = await Factory.deploy(token, token, durationSec, deployer.address, {
    type: 0,
    gasPrice,
    gasLimit: 8_000_000n,
  });
  await staking.waitForDeployment();
  const addr = await staking.getAddress();
  console.log("ZUSDCStaking deployed to:", addr);
  console.log("\nAdd to frontend/.env:");
  console.log(`VITE_STAKING_ADDRESS=${addr}`);
  console.log("\nNext: approve + fund 100,000 zUSDC (owner wallet):");
  console.log(`  npx hardhat run scripts/fundStakingRewards.ts --network hederaTestnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
