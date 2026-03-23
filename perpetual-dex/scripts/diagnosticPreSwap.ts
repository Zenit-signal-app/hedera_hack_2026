/**
 * Diagnostic: Check token associations and balances before swap
 */
import { ethers } from "hardhat";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const whbar = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET || "0x0000000000000000000000000000000000163b5a";
  const usdc = process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET || "0x000000000000000000000000000000000006f89a";
  const exchange = process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT || "0xb26ffBe614D95c925623218CF600bc1416A513Ba";

  console.log("=== Pre-Swap Diagnostic ===\n");
  console.log("Wallet:", signer.address);
  console.log("Exchange:", exchange);
  console.log("");

  const whbarContract = new ethers.Contract(whbar, ERC20_ABI, ethers.provider);
  const usdcContract = new ethers.Contract(usdc, ERC20_ABI, ethers.provider);

  const whbarBal = await whbarContract.balanceOf(signer.address);
  const whbarDec = await whbarContract.decimals();
  const whbarAllow = await whbarContract.allowance(signer.address, exchange);

  const usdcBal = await usdcContract.balanceOf(signer.address);
  const usdcDec = await usdcContract.decimals();

  console.log("WHBAR (0.0.1456986):");
  console.log("  Balance:", ethers.formatUnits(whbarBal, whbarDec), "WHBAR");
  console.log("  Allowance to Exchange:", ethers.formatUnits(whbarAllow, whbarDec), "WHBAR");
  console.log("");

  console.log("USDC (0.0.456858):");
  console.log("  Balance:", ethers.formatUnits(usdcBal, usdcDec), "USDC");
  console.log("");

  // Check Mirror API for token associations
  const mirrorBase = "https://mainnet-public.mirrornode.hedera.com";
  try {
    const r = await fetch(`${mirrorBase}/api/v1/accounts/${signer.address}`);
    if (r.ok) {
      const data = await r.json();
      console.log("Mirror API - Account Info:");
      console.log("  Account ID:", data.account);
      console.log("  Expiry:", new Date(Number(data.expiry_timestamp?.split(".")[0]) * 1000).toISOString());
      console.log("");

      const r2 = await fetch(`${mirrorBase}/api/v1/accounts/${signer.address}/tokens?limit=100`);
      if (r2.ok) {
        const tokens = await r2.json();
        const tokenIds = tokens.tokens?.map((t: any) => t.token_id) || [];
        console.log("Associated Tokens:");
        console.log("  WHBAR (0.0.1456986):", tokenIds.includes("0.0.1456986") ? "✅ Associated" : "❌ NOT Associated");
        console.log("  USDC (0.0.456858):", tokenIds.includes("0.0.456858") ? "✅ Associated" : "❌ NOT Associated");
        console.log("");
      }
    }
  } catch (e) {
    console.log("Could not fetch Mirror API data");
  }

  console.log("Recommendations:");
  if (whbarBal === 0n) {
    console.log("  ⚠️  No WHBAR balance - need to wrap HBAR first");
  }
  if (whbarAllow < ethers.parseUnits("10", whbarDec)) {
    console.log("  ⚠️  WHBAR allowance too low - need to approve Exchange");
  }
  console.log("  ℹ️  Make sure USDC (0.0.456858) is associated in HashPack");
  console.log("  ℹ️  Reduced gas limits: approve=1.5M, swap=2.5-3.5M");
}

main().catch(console.error);
