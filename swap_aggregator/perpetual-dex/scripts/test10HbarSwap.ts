/**
 * Get WHBAR by swapping a small amount of HBAR for WHBAR on SaucerSwap
 * Then test the 10 HBAR swap
 */
import { ethers } from "hardhat";

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const whbar = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET || "0x0000000000000000000000000000000000163b5a";
  const usdc = process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET || "0x000000000000000000000000000000000006f89a";
  const router = process.env.VITE_SAUCERSWAP_V1_ROUTER_MAINNET || "0x00000000000000000000000000000000002e7a5d";
  const exchange = process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT || "0xb26ffBe614D95c925623218CF600bc1416A513Ba";

  console.log("=== Test 10 HBAR Swap (via SaucerSwap wrap) ===\n");
  console.log("Step 1: Get 10 WHBAR from SaucerSwap");
  console.log("Step 2: Swap 10 WHBAR → USDC via Exchange\n");

  const routerContract = new ethers.Contract(router, ROUTER_ABI, signer);
  const whbarContract = new ethers.Contract(whbar, ERC20_ABI, signer);
  const usdcContract = new ethers.Contract(usdc, ERC20_ABI, ethers.provider);

  // Step 1: Get WHBAR
  const amountHbar = "10.1"; // Slightly more to cover any fees
  const valueWei = ethers.parseUnits(amountHbar, 18);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

  console.log("Getting WHBAR from SaucerSwap...");
  console.log("Swapping", amountHbar, "HBAR → WHBAR");

  const path = [whbar]; // Single token path for wrapping
  const minOut = 0n;

  const tx1 = await routerContract.swapExactETHForTokens(
    minOut,
    path,
    signer.address,
    deadline,
    { value: valueWei, gasLimit: 8_000_000n }
  );

  console.log("Wrap TX:", tx1.hash);
  await tx1.wait();

  const whbarBal = await whbarContract.balanceOf(signer.address);
  const whbarDec = await whbarContract.decimals();
  console.log("✅ WHBAR balance:", ethers.formatUnits(whbarBal, whbarDec), "WHBAR\n");

  // Step 2: Swap via Exchange
  console.log("Step 2: Swapping 10 WHBAR → USDC via Exchange...");

  const swapAmount = ethers.parseUnits("10", whbarDec);

  // Check allowance
  const allowance = await whbarContract.allowance(signer.address, exchange);
  if (allowance < swapAmount) {
    console.log("Approving Exchange...");
    const approveTx = await whbarContract.approve(exchange, swapAmount);
    await approveTx.wait();
    console.log("✅ Approved");
  }

  // Get quote from V1
  const pathSwap = [whbar, usdc];
  const amounts = await routerContract.getAmountsOut(swapAmount, pathSwap);
  const expectedOut = amounts[1];
  const minOutSwap = (expectedOut * 99n) / 100n; // 1% slippage

  console.log("Expected USDC:", ethers.formatUnits(expectedOut, 6));
  console.log("Min USDC:", ethers.formatUnits(minOutSwap, 6));

  // Prepare swap params
  const EXCHANGE_ABI = [
    "function swap((bytes32,address,address,uint256,uint256,address,uint256,bytes)) returns (uint256)",
  ];
  const exchangeContract = new ethers.Contract(exchange, EXCHANGE_ABI, signer);

  const adapterId = ethers.encodeBytes32String("saucerswap");
  const adapterData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [pathSwap]);

  const params = {
    adapterId,
    tokenIn: whbar,
    tokenOut: usdc,
    amountIn: swapAmount,
    minAmountOut: minOutSwap,
    recipient: signer.address,
    deadline,
    adapterData,
  };

  console.log("Executing swap...");
  const tx2 = await exchangeContract.swap(params, { gasLimit: 8_000_000n });
  console.log("Swap TX:", tx2.hash);
  const receipt = await tx2.wait();

  console.log("✅ Swap completed!");
  console.log("Status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");

  const usdcBal = await usdcContract.balanceOf(signer.address);
  console.log("\nFinal USDC balance:", ethers.formatUnits(usdcBal, 6), "USDC");
}

main().catch(console.error);
