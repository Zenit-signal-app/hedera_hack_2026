import { ethers } from "hardhat";

async function main() {
  // Use HEDERA_MAINNET_PRIVATE_KEY instead of the default PRIVATE_KEY
  const privateKey = process.env.HEDERA_MAINNET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("HEDERA_MAINNET_PRIVATE_KEY not found in .env");
  }

  const provider = ethers.provider;
  const wallet = new ethers.Wallet(privateKey, provider);

  const nativeBal = await provider.getBalance(wallet.address);
  const whbarAddr = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET || "0x0000000000000000000000000000000000163b5a";
  const usdcAddr = process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET || "0x000000000000000000000000000000000006f89a";

  const whbarContract = new ethers.Contract(
    whbarAddr,
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    provider
  );

  const usdcContract = new ethers.Contract(
    usdcAddr,
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    provider
  );

  const whbarBal = await whbarContract.balanceOf(wallet.address);
  const whbarDec = await whbarContract.decimals();
  const usdcBal = await usdcContract.balanceOf(wallet.address);
  const usdcDec = await usdcContract.decimals();

  console.log("\n=== HEDERA_MAINNET_PRIVATE_KEY Account ===");
  console.log("Wallet:", wallet.address);
  console.log("Native HBAR (weibars):", nativeBal.toString());
  console.log("Native HBAR (HBAR):", ethers.formatUnits(nativeBal, 18));
  console.log("WHBAR ERC-20 (tinybars):", whbarBal.toString());
  console.log("WHBAR ERC-20 (HBAR):", ethers.formatUnits(whbarBal, whbarDec));
  console.log("USDC (wei):", usdcBal.toString());
  console.log("USDC:", ethers.formatUnits(usdcBal, usdcDec));
}

main().catch(console.error);
