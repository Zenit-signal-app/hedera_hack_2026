/**
 * Deploy UniswapV2LikeAdapter (SaucerSwap V1 / Uniswap V2–style router) và Exchange.setAdapter.
 *
 * frontend/.env (Hardhat):
 *   AGGREGATOR_EXCHANGE_ADDRESS=0x...   (bắt buộc) — địa chỉ Exchange đã deploy
 *   AGGREGATOR_V2_ROUTER=0x...          (bắt buộc) — mặc định SaucerSwapV1RouterV3 (entity 0.0.3045981)
 *   ADAPTER_ID=saucerswap               (tuỳ chọn — khớp UI; dùng `heliswap` nếu chỉ đăng ký cũ)
 *
 * HeliSwap đã ngừng hoạt động — không dùng router HeliSwap.
 *
 * Chạy:
 *   npx hardhat run scripts/registerV2Adapter.ts --network hederaMainnet
 */
import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function txOverrides() {
  const provider = ethers.provider;
  const feeData = await provider.getFeeData();
  return {
    type: 0 as const,
    gasPrice: feeData.gasPrice ?? ethers.parseUnits("80", "gwei"),
    gasLimit: 8_000_000n,
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const exchangeAddr =
    process.env.AGGREGATOR_EXCHANGE_ADDRESS?.trim() ||
    process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT?.trim();
  /** SaucerSwapV1RouterV3 — 0.0.3045981 */
  const DEFAULT_SAUCERSWAP_V1_ROUTER =
    "0x00000000000000000000000000000000002e7a5d";
  const v2Router = process.env.AGGREGATOR_V2_ROUTER?.trim() || DEFAULT_SAUCERSWAP_V1_ROUTER;
  const adapterLabel = (process.env.ADAPTER_ID?.trim() || "saucerswap").slice(0, 31);

  if (!exchangeAddr || !/^0x[a-fA-F0-9]{40}$/.test(exchangeAddr)) {
    throw new Error(
      "Set AGGREGATOR_EXCHANGE_ADDRESS or VITE_AGGREGATOR_EXCHANGE_CONTRACT to your deployed Exchange (0x...).",
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(v2Router)) {
    throw new Error("AGGREGATOR_V2_ROUTER must be a valid 0x address (SaucerSwap V1 RouterV3 or compatible).");
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Exchange:  ", exchangeAddr);
  console.log("Router:    ", v2Router);
  console.log("Adapter id:", adapterLabel);
  if (bal === 0n) throw new Error("Deployer has 0 HBAR on this network.");

  const o = await txOverrides();

  const exchange = await ethers.getContractAt("Exchange", exchangeAddr);

  await sleep(1500);
  const V2 = await ethers.getContractFactory("UniswapV2LikeAdapter");
  const v2Adapter = await V2.deploy(deployer.address, exchangeAddr, v2Router, 0, o);
  await v2Adapter.waitForDeployment();
  const v2Addr = await v2Adapter.getAddress();
  console.log("UniswapV2LikeAdapter deployed:", v2Addr);

  const bytes32 = ethers.encodeBytes32String(adapterLabel);
  await sleep(2000);
  const tx = await exchange.setAdapter(bytes32, v2Addr, true, o);
  await tx.wait();
  console.log(`Exchange.setAdapter("${adapterLabel}" → ${v2Addr}) OK`);

  console.log("\n--- Verify ---");
  console.log(`npm run diagnose:aggregator:mainnet`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
