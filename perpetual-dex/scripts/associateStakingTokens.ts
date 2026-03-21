/**
 * Owner-only: ZUSDCStaking.associateTokens()
 *
 * On Hedera, the staking contract must be associated with zUSDC (HTS) or `stake()` reverts
 * on ERC-20 transferFrom — even if the user approved and is associated.
 *
 * Env (from frontend/.env via Hardhat): PRIVATE_KEY (owner), VITE_STAKING_ADDRESS
 */
import { ethers } from "hardhat";

async function main() {
  const stakingAddr =
    process.env.STAKING_ADDRESS?.trim() ||
    process.env.VITE_STAKING_ADDRESS?.trim();
  if (!stakingAddr) {
    throw new Error("Set STAKING_ADDRESS or VITE_STAKING_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  const staking = await ethers.getContractAt("ZUSDCStaking", stakingAddr);
  const owner = await staking.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not contract owner ${owner}. Use owner PRIVATE_KEY.`);
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("50", "gwei");
  console.log("Calling associateTokens on", stakingAddr);
  const tx = await staking.associateTokens({ type: 0, gasPrice, gasLimit: 2_500_000n });
  console.log("Submitted:", tx.hash);
  await tx.wait();
  console.log("associateTokens confirmed — staking contract can now receive zUSDC.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
