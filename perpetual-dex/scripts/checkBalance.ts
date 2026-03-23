import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const nativeBal = await ethers.provider.getBalance(signer.address);
  const whbarAddr = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET || "0x0000000000000000000000000000000000163b5a";

  const whbarContract = new ethers.Contract(
    whbarAddr,
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    ethers.provider
  );

  const whbarBal = await whbarContract.balanceOf(signer.address);
  const whbarDec = await whbarContract.decimals();

  console.log("Wallet:", signer.address);
  console.log("Native HBAR (weibars):", nativeBal.toString());
  console.log("Native HBAR (HBAR):", ethers.formatUnits(nativeBal, 18));
  console.log("WHBAR ERC-20 (tinybars):", whbarBal.toString());
  console.log("WHBAR ERC-20 (HBAR):", ethers.formatUnits(whbarBal, whbarDec));
}

main().catch(console.error);
