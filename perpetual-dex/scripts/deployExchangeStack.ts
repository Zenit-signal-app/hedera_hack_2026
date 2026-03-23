/**
 * Deploy Zenit aggregator stack: Exchange → QuoteAggregator (+ optional adapters).
 *
 * Usage (from `perpetual-dex/`):
 *   npx hardhat run scripts/deployExchangeStack.ts --network hederaMainnet
 *
 * Requires in `frontend/.env`:
 *   - Mainnet: HEDERA_MAINNET_PRIVATE_KEY=0x... (or PRIVATE_KEY as fallback)
 *   - Testnet: HEDERA_TESTNET_PRIVATE_KEY or PRIVATE_KEY
 *
 * Optional (mainnet / testnet):
 *   AGGREGATOR_V2_ROUTER=0x...        → deploy UniswapV2LikeAdapter
 *   SAUCERSWAP_V3_SWAP_ROUTER=0x...   → SaucerSwap V2 SwapRouter (exactInput)
 *   SAUCERSWAP_V3_QUOTER=0x...        → QuoterV2 (same network)
 *   ADAPTER_ID_V3=saucerswap_v2       → bytes32 id for UniswapV3SwapRouterAdapter
 *   ADAPTER_FEE_BPS=0                 → optional protocol fee on adapter (0–1000)
 *   FIXED_ADAPTER_TOKEN_IN=0x...
 *   FIXED_ADAPTER_TOKEN_OUT=0x...
 *   FIXED_RATE_NUMERATOR=1e18        (human-like, use full wei string)
 *   FIXED_RATE_DENOMINATOR=1e18
 *   ADAPTER_ID_V2=saucerswap          (bytes32 string, max 31 chars — **khớp** `VITE_AGGREGATOR_V1_ADAPTER_ID` / UI)
 *   ADAPTER_ID_FIXED=fixed
 */
import { ethers } from "hardhat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hedera JSON-RPC often works best with legacy tx + explicit gas (see `deploy.ts`). */
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
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Network:", net.chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Deployer balance (wei):", bal.toString());
  if (bal === 0n) {
    throw new Error(
      "Deployer has 0 HBAR for gas. Fund this EVM address on Hedera (testnet faucet / mainnet transfer), then re-run."
    );
  }

  const o = await txOverrides();

  const Exchange = await ethers.getContractFactory("Exchange");
  const exchange = await Exchange.deploy(deployer.address, o);
  await exchange.waitForDeployment();
  const exchangeAddr = await exchange.getAddress();
  console.log("Exchange deployed:", exchangeAddr);

  await sleep(2000);

  const QuoteAggregator = await ethers.getContractFactory("QuoteAggregator");
  const quoteAgg = await QuoteAggregator.deploy(exchangeAddr, o);
  await quoteAgg.waitForDeployment();
  const quoteAggAddr = await quoteAgg.getAddress();
  console.log("QuoteAggregator deployed:", quoteAggAddr);

  const v2Router = process.env.AGGREGATOR_V2_ROUTER?.trim();
  if (v2Router && /^0x[a-fA-F0-9]{40}$/.test(v2Router)) {
    await sleep(2000);
    const V2 = await ethers.getContractFactory("UniswapV2LikeAdapter");
    const v2Adapter = await V2.deploy(deployer.address, exchangeAddr, v2Router, 0, o);
    await v2Adapter.waitForDeployment();
    const v2Addr = await v2Adapter.getAddress();
    console.log("UniswapV2LikeAdapter deployed:", v2Addr);
    /** Phải khớp `encodeAdapterId` trên frontend (mặc định `saucerswap`, không dùng `v2`). */
    const idV2 = process.env.ADAPTER_ID_V2?.trim() || "saucerswap";
    const bytes32V2 = ethers.encodeBytes32String(idV2.slice(0, 31));
    const tx1 = await exchange.setAdapter(bytes32V2, v2Addr, true, o);
    await tx1.wait();
    console.log(`Exchange.setAdapter("${idV2}" → ${v2Addr})`);
  } else {
    console.log("Skip UniswapV2LikeAdapter (set AGGREGATOR_V2_ROUTER=0x... to deploy).");
  }

  const tin = process.env.FIXED_ADAPTER_TOKEN_IN?.trim();
  const tout = process.env.FIXED_ADAPTER_TOKEN_OUT?.trim();
  const rNum = process.env.FIXED_RATE_NUMERATOR?.trim();
  const rDen = process.env.FIXED_RATE_DENOMINATOR?.trim();
  if (
    tin &&
    tout &&
    rNum &&
    rDen &&
    /^0x[a-fA-F0-9]{40}$/.test(tin) &&
    /^0x[a-fA-F0-9]{40}$/.test(tout)
  ) {
    await sleep(2000);
    const Fixed = await ethers.getContractFactory("FixedRateSwapAdapter");
    const fixedAdapter = await Fixed.deploy(
      deployer.address,
      exchangeAddr,
      tin,
      tout,
      BigInt(rNum),
      BigInt(rDen),
      0,
      o
    );
    await fixedAdapter.waitForDeployment();
    const fixedAddr = await fixedAdapter.getAddress();
    console.log("FixedRateSwapAdapter deployed:", fixedAddr);
    const idFx = process.env.ADAPTER_ID_FIXED?.trim() || "fixed";
    const bytes32Fx = ethers.encodeBytes32String(idFx.slice(0, 31));
    const tx2 = await exchange.setAdapter(bytes32Fx, fixedAddr, true, o);
    await tx2.wait();
    console.log(`Exchange.setAdapter("${idFx}" → ${fixedAddr})`);
  } else {
    console.log("Skip FixedRateSwapAdapter (set FIXED_ADAPTER_TOKEN_IN/OUT + FIXED_RATE_NUMERATOR/DENOMINATOR).");
  }

  const v3Router = process.env.SAUCERSWAP_V3_SWAP_ROUTER?.trim();
  const v3Quoter = process.env.SAUCERSWAP_V3_QUOTER?.trim();
  if (
    v3Router &&
    v3Quoter &&
    /^0x[a-fA-F0-9]{40}$/.test(v3Router) &&
    /^0x[a-fA-F0-9]{40}$/.test(v3Quoter)
  ) {
    await sleep(2000);
    const feeBpsEnv = process.env.ADAPTER_FEE_BPS?.trim();
    const feeBps = feeBpsEnv !== undefined && feeBpsEnv !== "" ? Number(feeBpsEnv) : 0;
    if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) {
      throw new Error("ADAPTER_FEE_BPS must be 0–1000");
    }
    const V3 = await ethers.getContractFactory("UniswapV3SwapRouterAdapter");
    const v3Adapter = await V3.deploy(
      deployer.address,
      exchangeAddr,
      v3Router,
      v3Quoter,
      feeBps,
      o,
    );
    await v3Adapter.waitForDeployment();
    const v3Addr = await v3Adapter.getAddress();
    console.log("UniswapV3SwapRouterAdapter deployed:", v3Addr);
    const idV3 = process.env.ADAPTER_ID_V3?.trim() || "saucerswap_v2";
    const bytes32V3 = ethers.encodeBytes32String(idV3.slice(0, 31));
    const tx3 = await exchange.setAdapter(bytes32V3, v3Addr, true, o);
    await tx3.wait();
    console.log(`Exchange.setAdapter("${idV3}" → ${v3Addr})`);
  } else {
    console.log(
      "Skip UniswapV3SwapRouterAdapter (set SAUCERSWAP_V3_SWAP_ROUTER=0x... and SAUCERSWAP_V3_QUOTER=0x...).",
    );
  }

  console.log("\n--- Add to frontend/.env (public addresses only) ---");
  console.log(`VITE_AGGREGATOR_QUOTE_CONTRACT=${quoteAggAddr}`);
  console.log(`# Optional: VITE_AGGREGATOR_QUOTE_CONTRACT=${exchangeAddr}  # quote via Exchange directly`);
  console.log("\nVerify on HashScan (Hedera EVM / contract tab).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
