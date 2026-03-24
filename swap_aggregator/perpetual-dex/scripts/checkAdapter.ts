import { ethers } from "hardhat";

async function main() {
  const exchange = "0xb26ffBe614D95c925623218CF600bc1416A513Ba";
  const adapterId = ethers.encodeBytes32String("hbar_native_v1");

  const EXCHANGE_ABI = [
    "function adapters(bytes32) view returns (address adapter, bool active)",
  ];

  const exchangeContract = new ethers.Contract(exchange, EXCHANGE_ABI, ethers.provider);
  const [adapter, active] = await exchangeContract.adapters(adapterId);

  console.log("Adapter ID:", ethers.decodeBytes32String(adapterId));
  console.log("Adapter address:", adapter);
  console.log("Active:", active);
}

main().catch(console.error);
