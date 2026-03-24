import { ethers } from "ethers";
import { log } from "./logger.js";
import type { GasEstimate } from "./types.js";

const TAG = "gas";

const GAS_LIMIT_BUFFER_PCT = 20n;
const MAX_GAS_LIMIT = 1_000_000n;
const MIN_GAS_LIMIT = 100_000n;

const MAX_FEE_PER_GAS_GWEI = 50_000n;
const MAX_PRIORITY_FEE_GWEI = 100n;

/**
 * Estimate gas for a transaction with safety buffers.
 *
 * Strategy:
 * 1. Call eth_estimateGas to get the base estimate
 * 2. Add a 20% buffer to prevent out-of-gas reverts
 * 3. Clamp between MIN and MAX limits
 * 4. If estimation fails (e.g. tx would revert), return a fallback limit
 */
export async function estimateGasLimit(
  provider: ethers.JsonRpcProvider,
  txRequest: ethers.TransactionRequest,
  fallbackLimit = 500_000n,
): Promise<bigint> {
  try {
    const estimated = await provider.estimateGas(txRequest);
    const buffered = estimated + (estimated * GAS_LIMIT_BUFFER_PCT) / 100n;
    const clamped =
      buffered < MIN_GAS_LIMIT
        ? MIN_GAS_LIMIT
        : buffered > MAX_GAS_LIMIT
          ? MAX_GAS_LIMIT
          : buffered;

    log.info(TAG, `Gas estimated`, {
      raw: estimated.toString(),
      buffered: buffered.toString(),
      final: clamped.toString(),
    });

    return clamped;
  } catch (err) {
    log.warn(TAG, `Gas estimation failed – using fallback`, {
      fallback: fallbackLimit.toString(),
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackLimit;
  }
}

/**
 * Get optimal gas pricing for EIP-1559 chains.
 *
 * Strategy:
 * 1. Fetch the latest fee data from the node (baseFee + priority fee)
 * 2. Set maxPriorityFeePerGas to suggested or a reasonable default
 * 3. Set maxFeePerGas = 2 × baseFee + maxPriorityFeePerGas
 *    (this gives headroom for 1 full block of base fee increase)
 * 4. Clamp fees to protect against fee spikes
 * 5. If EIP-1559 is not supported, fall back to legacy gasPrice
 */
function shouldAllowEip1559(): boolean {
  // Default to legacy on Polkadot EVM RPCs; opt-in only.
  // Read at call-time so dotenv/config has a chance to load `.env`.
  return process.env.KEEPER_ALLOW_EIP1559_TX === "true";
}

export async function getOptimalGasFees(
  provider: ethers.JsonRpcProvider,
): Promise<GasEstimate> {
  try {
    const feeData = await provider.getFeeData();

    const ALLOW_EIP1559 = shouldAllowEip1559();
    if (!ALLOW_EIP1559 && feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
      log.info(TAG, `Ignoring EIP-1559 fee data (legacy tx enforced)`, {
        reason: "Set KEEPER_ALLOW_EIP1559_TX=true to opt-in",
      });
    }

    if (ALLOW_EIP1559 && feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
      let baseFee: bigint;
      try {
        const block = await provider.getBlock("latest");
        baseFee = (block as { baseFeePerGas?: bigint }).baseFeePerGas ?? feeData.maxFeePerGas - feeData.maxPriorityFeePerGas;
      } catch {
        baseFee = feeData.maxFeePerGas - feeData.maxPriorityFeePerGas;
      }

      let priorityFee = feeData.maxPriorityFeePerGas;
      const maxPriorityWei = MAX_PRIORITY_FEE_GWEI * 10n ** 9n;
      if (priorityFee > maxPriorityWei) priorityFee = maxPriorityWei;

      let maxFee = baseFee * 2n + priorityFee;
      const minRequired = baseFee + priorityFee;
      if (maxFee < minRequired) maxFee = minRequired;
      const maxFeeWei = MAX_FEE_PER_GAS_GWEI * 10n ** 9n;
      if (maxFee > maxFeeWei) maxFee = maxFeeWei;

      log.info(TAG, `EIP-1559 fees`, {
        baseFee: `${ethers.formatUnits(baseFee, "gwei")} gwei`,
        priorityFee: `${ethers.formatUnits(priorityFee, "gwei")} gwei`,
        maxFee: `${ethers.formatUnits(maxFee, "gwei")} gwei`,
      });

      return {
        type: "eip1559",
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: priorityFee,
      };
    }

    if (feeData.gasPrice !== null) {
      const boosted = (feeData.gasPrice * 110n) / 100n;

      log.info(TAG, `Legacy gas price`, {
        gasPrice: `${ethers.formatUnits(boosted, "gwei")} gwei`,
      });

      return {
        type: "legacy",
        gasPrice: boosted,
      };
    }

    const block = await provider.getBlock("latest");
    const baseFee = (block as { baseFeePerGas?: bigint }).baseFeePerGas;
    if (baseFee != null && baseFee > 0n) {
      const legacyPrice = (baseFee * 120n) / 100n;
      log.info(TAG, `Legacy gas price (from block baseFee)`, {
        gasPrice: `${ethers.formatUnits(legacyPrice, "gwei")} gwei`,
      });
      return {
        type: "legacy",
        gasPrice: legacyPrice,
      };
    }

    throw new Error("No fee data available from provider");
  } catch (err) {
    log.warn(TAG, `Fee data fetch failed – using safe defaults`, {
      error: err instanceof Error ? err.message : String(err),
    });

    try {
      const block = await provider.getBlock("latest");
      const baseFee = (block as { baseFeePerGas?: bigint }).baseFeePerGas;
      const fallback = baseFee != null && baseFee > 0n ? (baseFee * 120n) / 100n : 2000n * 10n ** 9n;
      return {
        type: "legacy",
        gasPrice: fallback,
      };
    } catch {
      return {
        type: "legacy",
        gasPrice: 2000n * 10n ** 9n,
      };
    }
  }
}

/**
 * Bump gas fees for a replacement (speed-up) transaction.
 * EIP-1559 requires at least 10% higher maxPriorityFeePerGas for replacement.
 */
export function bumpGasFees(
  previous: GasEstimate,
  bumpPct = 15n,
): GasEstimate {
  if (previous.type === "eip1559") {
    const newPriority =
      previous.maxPriorityFeePerGas! +
      (previous.maxPriorityFeePerGas! * bumpPct) / 100n;
    const newMax =
      previous.maxFeePerGas! + (previous.maxFeePerGas! * bumpPct) / 100n;

    log.info(TAG, `Bumped EIP-1559 fees (+${bumpPct}%)`, {
      priorityFee: `${ethers.formatUnits(newPriority, "gwei")} gwei`,
      maxFee: `${ethers.formatUnits(newMax, "gwei")} gwei`,
    });

    return {
      type: "eip1559",
      maxFeePerGas: newMax,
      maxPriorityFeePerGas: newPriority,
    };
  }

  const newPrice =
    previous.gasPrice! + (previous.gasPrice! * bumpPct) / 100n;

  log.info(TAG, `Bumped legacy gas price (+${bumpPct}%)`, {
    gasPrice: `${ethers.formatUnits(newPrice, "gwei")} gwei`,
  });

  return {
    type: "legacy",
    gasPrice: newPrice,
  };
}
