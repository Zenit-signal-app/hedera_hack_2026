import { Contract, JsonRpcProvider, type Provider } from "ethers";

import { HEDERA_EVM_MAINNET_CHAIN_ID, HEDERA_EVM_TESTNET_CHAIN_ID } from "../config/aggregator";
import { hederaJsonRpcUrl } from "./hederaDevProxy";

/**
 * Minimal ABI for `Exchange.quote` / `QuoteAggregator.quote` (same `SwapParams` tuple).
 * SwapParams: (bytes32 adapterId, address tokenIn, address tokenOut, uint256 amountIn,
 *              uint256 minAmountOut, address recipient, uint256 deadline, bytes adapterData)
 */
const QUOTE_AGGREGATOR_ABI = [
  "function quote((bytes32,address,address,uint256,uint256,address,uint256,bytes)) view returns (uint256)",
] as const;

export type SwapParamsStruct = {
  adapterId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: string;
  deadline: bigint;
  adapterData: string;
};

export type QuoteAggregatorBridgeMode = "mainnet" | "testnet";

export function defaultRpcUrlForChain(mode: QuoteAggregatorBridgeMode): string {
  return hederaJsonRpcUrl(mode === "mainnet" ? "mainnet" : "testnet");
}

export function chainIdForAggregatorBridge(mode: QuoteAggregatorBridgeMode): number {
  return mode === "mainnet" ? HEDERA_EVM_MAINNET_CHAIN_ID : HEDERA_EVM_TESTNET_CHAIN_ID;
}

/**
 * On-chain quote via `eth_call` (no gas). Use `quoteContractAddress` = `Exchange` or `QuoteAggregator`.
 */
export async function quoteViaExchangeOrAggregator(
  provider: Provider,
  quoteContractAddress: string,
  params: SwapParamsStruct
): Promise<bigint> {
  const c = new Contract(quoteContractAddress, QUOTE_AGGREGATOR_ABI, provider);
  const tuple = [
    params.adapterId,
    params.tokenIn,
    params.tokenOut,
    params.amountIn,
    params.minAmountOut,
    params.recipient,
    params.deadline,
    params.adapterData,
  ] as const;
  const out = (await c.quote.staticCall(tuple)) as bigint;
  return out;
}

/**
 * Convenience: JSON-RPC provider from public Hashio (Hedera EVM).
 * Hedera JSON-RPC + ethers v6: cần `batchMaxCount: 1` (SaucerSwap / Hedera docs) — nếu không, `eth_call` tới Quoter V2 có thể lỗi.
 */
export function createHashioProvider(mode: QuoteAggregatorBridgeMode): JsonRpcProvider {
  return new JsonRpcProvider(defaultRpcUrlForChain(mode), chainIdForAggregatorBridge(mode), {
    batchMaxCount: 1,
  });
}

/**
 * Mock quote (offline) — **not** on-chain pricing; use only when contracts are not deployed.
 * Mirrors `FixedRateSwapAdapter` style 1:1 math for preview.
 */
export function mockQuoteAmountOut(amountIn: bigint): bigint {
  return amountIn;
}
