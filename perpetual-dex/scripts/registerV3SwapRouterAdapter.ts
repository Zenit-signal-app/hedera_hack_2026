/**
 * Deploy `UniswapV3SwapRouterAdapter` (SaucerSwap V2 CLMM) và `Exchange.setAdapter` với id **`saucerswap_v2`**.
 * Không deploy Exchange mới — dùng khi đã có `Exchange` on-chain.
 *
 * `frontend/.env` (Hardhat đọc từ đây):
 *   AGGREGATOR_EXCHANGE_ADDRESS=0x...   (bắt buộc) hoặc VITE_AGGREGATOR_EXCHANGE_CONTRACT
 *   SAUCERSWAP_V3_SWAP_ROUTER=0x...     (tuỳ chọn trên mainnet — mặc định entity 0.0.3949434)
 *   SAUCERSWAP_V3_QUOTER=0x...          (tuỳ chọn trên mainnet — mặc định entity 0.0.3949424)
 *   ADAPTER_ID_V3=saucerswap_v2         (tuỳ chọn — khớp UI venue SaucerSwap)
 *   ADAPTER_FEE_BPS=0                   (tuỳ chọn, 0–1000)
 *
 * Testnet: **bắt buộc** set cả `SAUCERSWAP_V3_SWAP_ROUTER` và `SAUCERSWAP_V3_QUOTER` (docs SaucerSwap contract-deployments).
 *
 * Chạy:
 *   npm run register:adapter:v3:mainnet
 *   npm run register:adapter:v3:testnet
 */
import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Giống `hederaEntityNumToEvmAddress` trong `frontend/src/config/aggregator.ts`. */
function hederaEntityNumToEvmAddress(num: number): string {
  const hex = BigInt(num).toString(16).padStart(40, "0");
  return `0x${hex}`;
}

/** Mainnet — [SaucerSwap contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments). */
const DEFAULT_MAINNET_QUOTER = hederaEntityNumToEvmAddress(3949424);
const DEFAULT_MAINNET_ROUTER = hederaEntityNumToEvmAddress(3949434);

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
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId;
  const isMainnet = chainId === 295n;

  const exchangeAddr =
    process.env.AGGREGATOR_EXCHANGE_ADDRESS?.trim() ||
    process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT?.trim();

  let v3Router = process.env.SAUCERSWAP_V3_SWAP_ROUTER?.trim();
  let v3Quoter = process.env.SAUCERSWAP_V3_QUOTER?.trim();

  if (isMainnet) {
    v3Router = v3Router || DEFAULT_MAINNET_ROUTER;
    v3Quoter = v3Quoter || DEFAULT_MAINNET_QUOTER;
  } else {
    if (!v3Router || !v3Quoter) {
      throw new Error(
        "Testnet: set both SAUCERSWAP_V3_SWAP_ROUTER and SAUCERSWAP_V3_QUOTER (see SaucerSwap docs).",
      );
    }
  }

  const adapterLabel = (process.env.ADAPTER_ID_V3?.trim() || "saucerswap_v2").slice(0, 31);
  const feeBpsEnv = process.env.ADAPTER_FEE_BPS?.trim();
  const feeBps = feeBpsEnv !== undefined && feeBpsEnv !== "" ? Number(feeBpsEnv) : 0;

  if (!exchangeAddr || !/^0x[a-fA-F0-9]{40}$/.test(exchangeAddr)) {
    throw new Error(
      "Set AGGREGATOR_EXCHANGE_ADDRESS or VITE_AGGREGATOR_EXCHANGE_CONTRACT to your deployed Exchange (0x...).",
    );
  }
  if (!v3Router || !/^0x[a-fA-F0-9]{40}$/.test(v3Router)) {
    throw new Error("SAUCERSWAP_V3_SWAP_ROUTER must be a valid 0x address.");
  }
  if (!v3Quoter || !/^0x[a-fA-F0-9]{40}$/.test(v3Quoter)) {
    throw new Error("SAUCERSWAP_V3_QUOTER must be a valid 0x address.");
  }
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) {
    throw new Error("ADAPTER_FEE_BPS must be 0–1000");
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Network chainId:", chainId.toString(), isMainnet ? "(Hedera EVM mainnet)" : "");
  console.log("Deployer:", deployer.address);
  console.log("Exchange:  ", exchangeAddr);
  console.log("SwapRouter:", v3Router);
  console.log("QuoterV2:  ", v3Quoter);
  console.log("Adapter id:", adapterLabel, "(bytes32 — CLMM only)");
  if (bal === 0n) throw new Error("Deployer has 0 HBAR on this network.");

  const o = await txOverrides();
  const exchange = await ethers.getContractAt("Exchange", exchangeAddr);

  await sleep(1500);
  const V3 = await ethers.getContractFactory("UniswapV3SwapRouterAdapter");
  const v3Adapter = await V3.deploy(deployer.address, exchangeAddr, v3Router, v3Quoter, feeBps, o);
  await v3Adapter.waitForDeployment();
  const v3Addr = await v3Adapter.getAddress();
  console.log("UniswapV3SwapRouterAdapter deployed:", v3Addr);

  const bytes32 = ethers.encodeBytes32String(adapterLabel);
  await sleep(2000);
  const tx = await exchange.setAdapter(bytes32, v3Addr, true, o);
  await tx.wait();
  console.log(`Exchange.setAdapter("${adapterLabel}" → ${v3Addr}) OK`);

  console.log("\n--- Verify ---");
  console.log(`npm run diagnose:aggregator:mainnet`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
