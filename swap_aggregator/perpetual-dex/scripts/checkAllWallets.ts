import { ethers } from "hardhat";

async function main() {
  // Check all available private keys
  const keys = [
    { name: "PRIVATE_KEY", key: process.env.PRIVATE_KEY },
    { name: "HEDERA_MAINNET_PRIVATE_KEY", key: process.env.HEDERA_MAINNET_PRIVATE_KEY },
    { name: "VITE_FAUCET_PRIVATE_KEY", key: process.env.VITE_FAUCET_PRIVATE_KEY },
  ];

  const provider = ethers.provider;
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

  for (const { name, key } of keys) {
    if (!key) continue;

    try {
      const wallet = new ethers.Wallet(key, provider);
      const nativeBal = await provider.getBalance(wallet.address);
      const whbarBal = await whbarContract.balanceOf(wallet.address);
      const whbarDec = await whbarContract.decimals();
      const usdcBal = await usdcContract.balanceOf(wallet.address);
      const usdcDec = await usdcContract.decimals();

      console.log(`\n=== ${name} ===`);
      console.log("Address:", wallet.address);
      console.log("Native HBAR:", ethers.formatUnits(nativeBal, 18));
      console.log("WHBAR:", ethers.formatUnits(whbarBal, whbarDec));
      console.log("USDC:", ethers.formatUnits(usdcBal, usdcDec));
    } catch (e) {
      console.log(`\n=== ${name} === ERROR:`, e instanceof Error ? e.message : e);
    }
  }
}

main().catch(console.error);
