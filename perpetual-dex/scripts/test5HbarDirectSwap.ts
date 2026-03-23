/**
 * Test native HBAR → USDC swap via SaucerSwap V1 router directly
 */
import { ethers } from "hardhat";

const ROUTER_ABI = [
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  const whbar = "0x0000000000000000000000000000000000163b5a";
  const usdc = "0x000000000000000000000000000000000006f89a";
  const router = "0x00000000000000000000000000000000002e7a5d";

  console.log("=== Test 5 HBAR → USDC Direct Swap ===\n");
  console.log("Wallet:", signer.address);
  console.log("Router:", router);
  console.log("Path: HBAR → WHBAR → USDC\n");

  const routerContract = new ethers.Contract(router, ROUTER_ABI, signer);
  const usdcContract = new ethers.Contract(usdc, ERC20_ABI, ethers.provider);

  const amountHbar = "5";
  const amountTinybars = ethers.parseUnits(amountHbar, 8);  // Router uses tinybars
  const valueWei = amountTinybars * 10n ** 10n;              // msg.value uses weibars
  const path = [whbar, usdc];

  // Get quote (router uses tinybars)
  console.log("Getting quote...");
  const amounts = await routerContract.getAmountsOut(amountTinybars, path);
  const expectedOut = amounts[1];
  console.log("Expected USDC:", ethers.formatUnits(expectedOut, 6));

  const minOut = (expectedOut * 98n) / 100n; // 2% slippage
  console.log("Min USDC (2% slippage):", ethers.formatUnits(minOut, 6));
  console.log();

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

  // Execute swap
  console.log("Executing swap...");
  const usdcBefore = await usdcContract.balanceOf(signer.address);
  console.log("USDC before:", ethers.formatUnits(usdcBefore, 6));

  const tx = await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
    minOut,
    path,
    signer.address,
    deadline,
    { value: valueWei, gasLimit: 2_000_000n }
  );

  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Swap completed! Status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");
  console.log("Gas used:", receipt?.gasUsed.toString());

  const usdcAfter = await usdcContract.balanceOf(signer.address);
  const usdcReceived = usdcAfter - usdcBefore;
  console.log("\nUSDC after:", ethers.formatUnits(usdcAfter, 6));
  console.log("USDC received:", ethers.formatUnits(usdcReceived, 6));
}

main().catch(console.error);
