import { Contract, parseUnits } from "ethers";

import type { AggregatorNetwork } from "@/config/aggregator";
import { createHashioProvider, quoteViaExchangeOrAggregator, type SwapParamsStruct } from "@/lib/aggregatorQuoteBridge";

const ERC20_DECIMALS_ABI = ["function decimals() view returns (uint8)"] as const;

async function readTokenInDecimals(provider: ReturnType<typeof createHashioProvider>, token: string): Promise<number> {
  try {
    const c = new Contract(token, ERC20_DECIMALS_ABI, provider);
    const d = await c.decimals.staticCall();
    return Number(d);
  } catch {
    return 18;
  }
}

export type OnchainQuoteInput = {
  network: AggregatorNetwork;
  quoteContract: `0x${string}`;
  adapterId: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountInHuman: string;
  /** @deprecated Không dùng — luôn đọc `decimals()` on-chain để khớp router (WHBAR = 8). */
  tokenInDecimals?: number;
  recipient: `0x${string}`;
  adapterData?: `0x${string}`;
};

export async function quoteOnchainExpectedOut(input: OnchainQuoteInput): Promise<bigint> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const provider = createHashioProvider(input.network === "mainnet" ? "mainnet" : "testnet");
  const decimals = await readTokenInDecimals(provider, input.tokenIn);
  const amountIn = parseUnits(input.amountInHuman || "0", decimals);

  const params: SwapParamsStruct = {
    adapterId: input.adapterId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn,
    minAmountOut: 0n,
    recipient: input.recipient,
    deadline,
    adapterData: input.adapterData ?? "0x",
  };

  return quoteViaExchangeOrAggregator(provider, input.quoteContract, params);
}
