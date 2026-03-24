import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(signer.address);
  console.log("Address:", signer.address);
  console.log("HBAR balance:", ethers.formatEther(bal), "HBAR");
}

main().catch(console.error);
