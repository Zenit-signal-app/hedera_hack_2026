import { ethers } from "ethers";
import { config } from "./config.js";
import { symbolToBytes32 } from "./abi.js";
import { log } from "./logger.js";
import type { PriceTick } from "./types.js";
import { getTxManager } from "./txManager.js";
import { getOptimalGasFees, estimateGasLimit } from "./gasOptimizer.js";

const TAG = "oracle";

const oracleSignerKey = (config.oraclePrivateKey ?? config.keeperPrivateKey) as `0x${string}`;
const { wallet, nonceManager, runExclusive, provider } = getTxManager(oracleSignerKey);

const ORACLE_ABI = [
  "function setPrices(bytes32[] markets, uint256[] prices) external",
  "function updater() view returns (address)",
];

export async function publishOraclePrices(prices: PriceTick[]): Promise<void> {
  if (!config.oracleAddress) return;
  if (prices.length === 0) return;

  const oracle = new ethers.Contract(config.oracleAddress, ORACLE_ABI, wallet);
  const markets: string[] = [];
  const values: bigint[] = [];

  for (const p of prices) {
    markets.push(symbolToBytes32(p.market));
    // Convert number USD price to 1e18
    values.push(ethers.parseUnits(p.price.toFixed(8), 18));
  }

  try {
    await runExclusive(async () => {
      const nonce = await nonceManager.acquireNonce();
      const gasFees = await getOptimalGasFees(provider);
      const txReq = await oracle.setPrices.populateTransaction(markets, values);
      const gasLimit = await estimateGasLimit(
        provider,
        { ...txReq, from: wallet.address, nonce, chainId: config.chainId, ...(gasFees.type === "legacy" ? { gasPrice: gasFees.gasPrice, type: 0 } : { maxFeePerGas: gasFees.maxFeePerGas, maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas, type: 2 }) },
        250_000n,
      );
      const tx = await wallet.sendTransaction({
        ...txReq,
        from: wallet.address,
        nonce,
        chainId: config.chainId,
        gasLimit,
        ...(gasFees.type === "legacy"
          ? { gasPrice: gasFees.gasPrice, type: 0 }
          : { maxFeePerGas: gasFees.maxFeePerGas, maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas, type: 2 }),
      });
      log.info(TAG, "Oracle prices tx sent", { txHash: tx.hash, count: prices.length });
      await tx.wait();
      log.info(TAG, "Oracle prices updated", { txHash: tx.hash });
    });
  } catch (err) {
    log.warn(TAG, "Failed to publish oracle prices", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

