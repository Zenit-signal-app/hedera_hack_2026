/**
 * Wrap HBAR to WHBAR using SaucerSwap V1 router (swapExactETHForTokens)
 * This is an alternative to calling WHBAR.deposit() directly
 */
import { ethers } from "hardhat";

const ROUTER_ABI = [
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const whbar = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET || "0x0000000000000000000000000000000000163b5a";
  const router = process.env.VITE_SAUCERSWAP_V1_ROUTER_MAINNET || "0x00000000000000000000000000000000002e7a5d";

  const amountHbar = "10";
  const valueWei = ethers.parseUnits(amountHbar, 18);
  const minOut = 0n; // Accept any amount for wrapping
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

  console.log("=== Wrap HBAR → WHBAR via SaucerSwap ===");
  console.log("Signer:", signer.address);
  console.log("Router:", router);
  console.log("WHBAR:", whbar);
  console.log("Amount:", amountHbar, "HBAR");
  console.log("");

  const routerContract = new ethers.Contract(router, ROUTER_ABI, signer);

  console.log("Submitting swap (HBAR → WHBAR)...");
  const tx = await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
    minOut,
    [whbar, whbar], // Path: WHBAR → WHBAR (just wraps)
    signer.address,
    deadline,
    { value: valueWei, gasLimit: 8_000_000n }
  );

  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");
  console.log("");
  console.log("Check balance:");

  const whbarContract = new ethers.Contract(
    whbar,
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    ethers.provider
  );

  const bal = await whbarContract.balanceOf(signer.address);
  const dec = await whbarContract.decimals();
  console.log("WHBAR balance:", ethers.formatUnits(bal, dec), "WHBAR");
}

main().catch(console.error);
