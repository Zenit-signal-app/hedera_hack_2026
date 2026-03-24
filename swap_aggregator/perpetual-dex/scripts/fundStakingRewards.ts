/**
 * Owner funds the staking reward pool and starts emission.
 * Default: 100,000 zUSDC (human) using token decimals from chain.
 *
 * Env:
 * - STAKING_ADDRESS or VITE_STAKING_ADDRESS
 * - PRIVATE_KEY, HEDERA_TESTNET_RPC_URL (via frontend/.env for Hardhat)
 * - STAKING_REWARD_AMOUNT (optional, default "100000")
 * - STAKING_FUND_ONLY=1 — skip ERC20 transfer; only call fundRewards after you sent zUSDC via HashPack (HTS)
 * - SKIP_ASSOCIATE=1 — skip associateTokens (if already done)
 *
 * Hedera HTS: ERC20 transfer/approve from Hardhat often reverts on the token proxy.
 * Reliable path: HashPack → HTS transfer zUSDC to staking contract, then STAKING_FUND_ONLY=1.
 */
import { ethers } from "hardhat";

const REWARD_HUMAN = process.env.STAKING_REWARD_AMOUNT ?? "100000";

function envFlag(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  const stakingAddr =
    process.env.STAKING_ADDRESS?.trim() ||
    process.env.VITE_STAKING_ADDRESS?.trim();
  if (!stakingAddr) {
    throw new Error("Set STAKING_ADDRESS or VITE_STAKING_ADDRESS");
  }

  const fundOnly = envFlag("STAKING_FUND_ONLY");
  const skipAssociate = envFlag("SKIP_ASSOCIATE");

  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("50", "gwei");
  const txOpts = { type: 0 as const, gasPrice, gasLimit: 2_000_000n };

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Owner:", deployer.address, "| HBAR:", ethers.formatEther(bal));
  if (fundOnly) {
    console.log("Mode: STAKING_FUND_ONLY (no ERC20 transfer from script)");
  }

  const staking = await ethers.getContractAt("ZUSDCStaking", stakingAddr);

  const tokenAddr = await staking.stakingToken();
  const token = await ethers.getContractAt(
    [
      "function decimals() view returns (uint8)",
      "function transfer(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ],
    tokenAddr,
  );
  const decimals = Number(await token.decimals());
  const amount = ethers.parseUnits(REWARD_HUMAN, decimals);

  console.log("Staking:", stakingAddr);
  console.log("Token:", tokenAddr);
  console.log("Funding reward amount (human):", REWARD_HUMAN, "decimals:", decimals);
  console.log("Funding reward amount (raw):", amount.toString());

  if (!skipAssociate) {
    try {
      const tx0 = await staking.associateTokens(txOpts);
      await tx0.wait();
      console.log("associateTokens ok, tx:", tx0.hash);
    } catch (e: unknown) {
      console.warn(
        "associateTokens failed (OK if token already associated):",
        e instanceof Error ? e.message : e,
      );
    }
  } else {
    console.log("SKIP_ASSOCIATE: skipping associateTokens");
  }

  let balStaking = await token.balanceOf(stakingAddr);
  console.log("Staking contract zUSDC balance (raw):", balStaking.toString());

  if (balStaking < amount) {
    if (fundOnly) {
      throw new Error(
        `Staking balance ${balStaking} < required ${amount}.\n` +
          `Send ${REWARD_HUMAN} zUSDC to the staking contract via HashPack (HTS transfer to EVM address):\n` +
          `  ${stakingAddr}\n` +
          `Then run again with STAKING_FUND_ONLY=1`,
      );
    }

    const need = amount - balStaking;
    console.log(`Short by ${need} raw units; trying ERC20 transfer from owner...`);

    try {
      const tx1 = await token.transfer(stakingAddr, need, txOpts);
      await tx1.wait();
      console.log("transfer ok, tx:", tx1.hash);
    } catch (e: unknown) {
      console.error(
        "\nERC20 transfer from Hardhat reverted (typical for Hedera HTS token proxy).\n" +
          "Do this instead:\n" +
          `  1) HashPack: send ${REWARD_HUMAN} zUSDC (HTS) to staking address:\n` +
          `     ${stakingAddr}\n` +
          "  2) Then run:\n" +
          "     STAKING_FUND_ONLY=1 npx hardhat run scripts/fundStakingRewards.ts --network hederaTestnet\n" +
          "     (optionally SKIP_ASSOCIATE=1 if already associated)\n",
      );
      throw e;
    }

    balStaking = await token.balanceOf(stakingAddr);
  }

  if (balStaking < amount) {
    throw new Error(`After transfer, staking balance ${balStaking} still < ${amount}`);
  }

  console.log("Calling fundRewards — staking balance sufficient.");

  const tx2 = await staking.fundRewards(amount, txOpts);
  await tx2.wait();
  console.log("fundRewards tx:", tx2.hash);

  const rate = await staking.rewardRate();
  const finish = await staking.periodFinish();
  console.log("rewardRate:", rate.toString());
  console.log("periodFinish:", finish.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
