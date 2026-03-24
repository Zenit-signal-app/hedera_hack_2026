import { ethers } from "ethers";
import { config } from "./config.js";
import { PERPETUAL_DEX_ABI_HUMAN, symbolToBytes32 } from "./abi.js";
import { getTxManager } from "./txManager.js";
import { estimateGasLimit, getOptimalGasFees, bumpGasFees } from "./gasOptimizer.js";
import { log } from "./logger.js";
import type { Order, ClosureStats, TxResult, RetryConfig, GasEstimate } from "./types.js";

// ─── Provider & Wallet (ethers.js v6) ────────────────────────────────────────

const { provider, wallet, nonceManager, runExclusive } = getTxManager(config.keeperPrivateKey);

const contract = new ethers.Contract(
  config.perpDexAddress,
  PERPETUAL_DEX_ABI_HUMAN,
  wallet,
);

log.info("executor", `Keeper wallet initialized`, {
  address: wallet.address,
  chain: config.chainId,
  contract: config.perpDexAddress,
});

// ─── Default retry configuration ─────────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  gasBumpOnRetry: true,
  gasBumpPct: 15n,
  receiptTimeoutMs: 60_000,
};

// ─── Error classification ────────────────────────────────────────────────────

function isNonceTooLow(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("nonce too low") || msg.includes("nonce has already been used");
}

function isUnderpricedTx(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("replacement transaction underpriced") ||
    msg.includes("transaction underpriced") ||
    msg.includes("already known")
  );
}

function isRevertError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("execution reverted") || msg.includes("revert");
}

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("network error") ||
    msg.includes("server error") ||
    msg.includes("bad gateway")
  );
}

function isInvalidTx(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  // Polkadot EVM RPCs often return "Invalid Transaction" for nonce/pool issues.
  return msg.includes("invalid transaction") || msg.includes("\"code\": 1010");
}

// ─── Wait for receipt with timeout ───────────────────────────────────────────

async function waitForReceipt(
  txHash: string,
  timeoutMs: number,
): Promise<ethers.TransactionReceipt | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt !== null) return receipt;
    } catch {
      // Transient RPC error – keep polling
    }
    await sleep(3_000);
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Generic retry wrapper ───────────────────────────────────────────────────

async function sendWithRetry(
  tag: string,
  buildTx: (nonce: number, gasFees: GasEstimate, gasLimit: bigint) => Promise<ethers.TransactionRequest>,
  retryConfig: RetryConfig = DEFAULT_RETRY,
): Promise<TxResult> {
  let lastGasFees: GasEstimate | null = null;
  let lastNonce: number | null = null;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    const attemptTag = `${tag}:attempt-${attempt}/${retryConfig.maxAttempts}`;

    try {
      // Ensure all tx from this wallet are serialized to avoid nonce collisions
      const result = await runExclusive(async () => {
        // ── Acquire nonce ───────────────────────────────────────────────────
        const nonce = await nonceManager.acquireNonce();
        lastNonce = nonce;

        // ── Get gas fees ────────────────────────────────────────────────────
        let gasFees: GasEstimate;
        if (attempt > 1 && lastGasFees && retryConfig.gasBumpOnRetry) {
          gasFees = bumpGasFees(lastGasFees, retryConfig.gasBumpPct);
        } else {
          gasFees = await getOptimalGasFees(provider);
        }
        lastGasFees = gasFees;

        // ── Build tx request for gas estimation ─────────────────────────────
        const txRequest = await buildTx(nonce, gasFees, 0n);
        const gasLimit = await estimateGasLimit(provider, txRequest);

        // ── Build final tx with gas limit ───────────────────────────────────
        const finalTx = await buildTx(nonce, gasFees, gasLimit);

        log.action(attemptTag, `Sending transaction`, {
          nonce,
          gasLimit: gasLimit.toString(),
          feeType: gasFees.type,
          ...(gasFees.type === "eip1559"
            ? {
                maxFee: `${ethers.formatUnits(gasFees.maxFeePerGas, "gwei")}gwei`,
                priorityFee: `${ethers.formatUnits(gasFees.maxPriorityFeePerGas, "gwei")}gwei`,
              }
            : { gasPrice: `${ethers.formatUnits(gasFees.gasPrice, "gwei")}gwei` }),
        });

        // ── Submit transaction ──────────────────────────────────────────────
        const txResponse = await wallet.sendTransaction(finalTx);
        const txHash = txResponse.hash;

        log.info(attemptTag, `Tx broadcast`, { txHash });

        // ── Wait for receipt ────────────────────────────────────────────────
        const receipt = await waitForReceipt(txHash, retryConfig.receiptTimeoutMs);

        if (!receipt) {
          log.warn(attemptTag, `Receipt timeout after ${retryConfig.receiptTimeoutMs}ms – tx may still confirm`, {
            txHash,
          });

          if (attempt < retryConfig.maxAttempts) {
            log.info(attemptTag, `Will retry with bumped gas (replacement tx)`);
            // Don't roll back nonce – we'll reuse it with higher gas
            nonceManager.rollback();
            await sleepWithBackoff(attempt, retryConfig);
            return {
              success: false,
              txHash,
              gasUsed: null,
              blockNumber: null,
              keeperReward: null,
              finalPnl: null,
              error: "Receipt timeout",
              attempts: attempt,
            };
          }

          return {
            success: false,
            txHash,
            gasUsed: null,
            blockNumber: null,
            keeperReward: null,
            finalPnl: null,
            error: "Receipt timeout",
            attempts: attempt,
          };
        }

        // ── Check receipt status ────────────────────────────────────────────
        if (receipt.status === 0) {
          log.error(attemptTag, `Transaction reverted on-chain`, {
            txHash,
            gasUsed: receipt.gasUsed.toString(),
            blockNumber: receipt.blockNumber,
          });

          return {
            success: false,
            txHash,
            gasUsed: receipt.gasUsed,
            blockNumber: receipt.blockNumber,
            keeperReward: null,
            finalPnl: null,
            error: "Transaction reverted on-chain",
            attempts: attempt,
          };
        }

        // ── Parse keeper reward + closure PnL from logs ────────────────────
        let keeperReward: bigint | null = null;
        let finalPnl: bigint | null = null;
        try {
          const iface = new ethers.Interface(PERPETUAL_DEX_ABI_HUMAN);
          for (const receiptLog of receipt.logs) {
            try {
              const parsed = iface.parseLog({
                topics: receiptLog.topics as string[],
                data: receiptLog.data,
              });
              if (parsed && parsed.name === "KeeperRewardClaimed") {
                keeperReward = parsed.args[1] as bigint;
              }
              if (
                parsed &&
                (parsed.name === "PositionClosed" || parsed.name === "PositionLiquidated")
              ) {
                // event PositionClosed(user, market, amount, pnl)
                // event PositionLiquidated(user, market, amount, pnl)
                finalPnl = parsed.args[3] as bigint;
              }
            } catch {
              // Not a matching event
            }
          }
        } catch {
          // Log parsing is optional
        }

        log.action(attemptTag, `Transaction confirmed`, {
          txHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          keeperReward: keeperReward
            ? `${ethers.formatUnits(keeperReward, 18)} zUSDC`
            : "none",
        });

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
          blockNumber: receipt.blockNumber,
          keeperReward,
          finalPnl,
          error: null,
          attempts: attempt,
        };
      });

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // ── Nonce too low → re-sync and retry immediately ─────────────────
      if (isNonceTooLow(err)) {
        log.warn(attemptTag, `Nonce too low – re-syncing`, { error: errMsg });
        await nonceManager.resetNonce();
        if (attempt < retryConfig.maxAttempts) continue;
      }

      // ── "Invalid Transaction" (often pool/nonce related) → re-sync nonce and retry ──
      if (isInvalidTx(err)) {
        log.warn(attemptTag, `Invalid transaction – re-syncing nonce and retrying`, { error: errMsg });
        await nonceManager.resetNonce();
        if (attempt < retryConfig.maxAttempts) {
          await sleepWithBackoff(attempt, retryConfig);
          continue;
        }
      }

      // ── Underpriced → bump gas and retry with same nonce ──────────────
      if (isUnderpricedTx(err)) {
        log.warn(attemptTag, `Tx underpriced – bumping gas`, { error: errMsg });
        if (lastNonce !== null) nonceManager.rollback();
        if (attempt < retryConfig.maxAttempts) {
          await sleepWithBackoff(attempt, retryConfig);
          continue;
        }
      }

      // ── Revert → don't retry, contract logic rejected it ──────────────
      if (isRevertError(err)) {
        log.error(attemptTag, `Contract revert – not retrying`, { error: errMsg });
        return {
          success: false,
          txHash: null,
          gasUsed: null,
          blockNumber: null,
          keeperReward: null,
          finalPnl: null,
          error: errMsg,
          attempts: attempt,
        };
      }

      // ── Network error → retry with backoff ────────────────────────────
      if (isNetworkError(err)) {
        log.warn(attemptTag, `Network error – retrying`, { error: errMsg });
        nonceManager.rollback();
        if (attempt < retryConfig.maxAttempts) {
          await sleepWithBackoff(attempt, retryConfig);
          continue;
        }
      }

      // ── Unknown error ─────────────────────────────────────────────────
      log.error(attemptTag, `Unexpected error`, {
        error: errMsg,
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" → ") : undefined,
      });

      nonceManager.rollback();

      if (attempt < retryConfig.maxAttempts) {
        await sleepWithBackoff(attempt, retryConfig);
        continue;
      }

      return {
        success: false,
        txHash: null,
        gasUsed: null,
        blockNumber: null,
        keeperReward: null,
        finalPnl: null,
        error: errMsg,
        attempts: attempt,
      };
    }
  }

  return {
    success: false,
    txHash: null,
    gasUsed: null,
    blockNumber: null,
    keeperReward: null,
    finalPnl: null,
    error: "Exhausted all retry attempts",
    attempts: retryConfig.maxAttempts,
  };
}

async function sleepWithBackoff(attempt: number, cfg: RetryConfig): Promise<void> {
  const delay = Math.min(
    cfg.initialDelayMs * cfg.backoffMultiplier ** (attempt - 1),
    cfg.maxDelayMs,
  );
  log.info("retry", `Waiting ${delay}ms before attempt ${attempt + 1}`);
  await sleep(delay);
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Execute an on-chain close for a position via the keeper-specific contract
 * function `keeperClosePosition`. This function:
 *
 * 1. Calls keeperClosePosition(user, market, amount, closePrice)
 *    → The smart contract closes the position, calculates PnL, returns margin
 *      to the user, and allocates a keeper reward.
 *
 * 2. Handles gas estimation, nonce management, and retry logic.
 *
 * 3. Falls back to the standard closePosition(market, amount) if the keeper
 *    function is not available on the contract.
 */
export async function executeOnChainClose(
  order: Order,
  currentPrice?: number,
): Promise<TxResult> {
  const tag = "executor:close";
  const marketBytes = symbolToBytes32(order.market);

  // Contract expects margin amount (zUSDC). Use on-chain position if user increased.
  let amount: bigint;
  try {
    const pos = await contract.getCurrentPosition(order.walletAddress, marketBytes);
    const onChainMargin = pos[0] as bigint;
    amount = onChainMargin > 0n ? onChainMargin : ethers.parseUnits(order.marginAmount, 18);
  } catch {
    amount = ethers.parseUnits(order.marginAmount, 18);
  }

  const closePriceWei = currentPrice
    ? ethers.parseUnits(currentPrice.toFixed(8), 18)
    : 0n;

  log.action(tag, `Preparing to close position`, {
    orderId: order.id,
    market: order.market,
    side: order.side,
    positionSize: order.positionSize,
    wallet: order.walletAddress,
    currentPrice: currentPrice ? `$${currentPrice.toFixed(2)}` : "unknown",
  });

  // Attempt keeper-specific close first (includes reward)
  const result = await sendWithRetry(
    tag,
    async (nonce, gasFees, gasLimit) => {
      const txData = contract.interface.encodeFunctionData(
        "keeperClosePosition",
        [order.walletAddress, marketBytes, amount, closePriceWei],
      );

      const tx: ethers.TransactionRequest = {
        from: wallet.address,
        to: config.perpDexAddress,
        data: txData,
        nonce,
        chainId: config.chainId,
        ...(gasLimit > 0n ? { gasLimit } : {}),
        ...(gasFees.type === "eip1559"
          ? {
              maxFeePerGas: gasFees.maxFeePerGas,
              maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
              type: 2,
            }
          : { gasPrice: gasFees.gasPrice, type: 0 }),
      };

      return tx;
    },
  );

  // If keeper function reverted (likely not deployed yet), fall back to standard close
  if (!result.success && result.error?.includes("revert")) {
    log.warn(tag, `keeperClosePosition reverted – falling back to standard closePosition`, {
      orderId: order.id,
    });

    return sendWithRetry(
      `${tag}:fallback`,
      async (nonce, gasFees, gasLimit) => {
        const txData = contract.interface.encodeFunctionData(
          "closePosition",
          [marketBytes, amount],
        );

        const tx: ethers.TransactionRequest = {
          from: wallet.address,
          to: config.perpDexAddress,
          data: txData,
          nonce,
          chainId: config.chainId,
          ...(gasLimit > 0n ? { gasLimit } : {}),
          ...(gasFees.type === "eip1559"
            ? {
                maxFeePerGas: gasFees.maxFeePerGas,
                maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
                type: 2,
              }
            : { gasPrice: gasFees.gasPrice, type: 0 }),
        };

        return tx;
      },
    );
  }

  if (result.success) {
    log.action(tag, `Position closed`, {
      orderId: order.id,
      txHash: result.txHash,
      gasUsed: result.gasUsed?.toString(),
      keeperReward: result.keeperReward
        ? `${ethers.formatUnits(result.keeperReward, 18)} zUSDC`
        : "none",
      attempts: result.attempts,
    });
  } else {
    log.error(tag, `Failed to close position after ${result.attempts} attempts`, {
      orderId: order.id,
      error: result.error,
    });
  }

  return result;
}

/**
 * Submit closure statistics to the smart contract's on-chain history.
 * Calls recordClosureHistory(user, market, pnl, duration, entryPrice, closePrice, side, leverage)
 * then returnMargin(user, marginAmount, pnl) to handle margin settlement.
 *
 * This is called after the off-chain DB is updated, so failures here are
 * non-fatal to the overall close flow.
 */
export async function updateSmartContractWithClosureStats(
  stats: ClosureStats,
): Promise<TxResult> {
  const tag = "executor:stats";

  log.action(tag, `Recording closure stats on-chain`, {
    positionId: stats.positionId,
    market: stats.market,
    side: stats.side,
    pnl: stats.pnl,
    leverage: `${stats.leverage}x`,
    durationMin: Math.round(stats.durationMs / 60_000),
  });

  const marketBytes = symbolToBytes32(stats.market);
  const pnlStr = stats.pnl.replace("+", "");
  const pnlWei = ethers.parseUnits(pnlStr, 18);
  const durationSec = BigInt(Math.floor(stats.durationMs / 1_000));
  const entryPriceWei = ethers.parseUnits(stats.entryPrice.toFixed(8), 18);
  const closePriceWei = stats.closePrice
    ? ethers.parseUnits(stats.closePrice.toFixed(8), 18)
    : 0n;
  const sideEnum = stats.side === "Long" ? 0 : 1;

  // ── Step 1: Record closure history ────────────────────────────────────────
  const historyResult = await sendWithRetry(
    `${tag}:history`,
    async (nonce, gasFees, gasLimit) => {
      const txData = contract.interface.encodeFunctionData(
        "recordClosureHistory",
        [
          stats.walletAddress,
          marketBytes,
          pnlWei,
          durationSec,
          entryPriceWei,
          closePriceWei,
          sideEnum,
          stats.leverage,
        ],
      );

      return {
        from: wallet.address,
        to: config.perpDexAddress,
        data: txData,
        nonce,
        chainId: config.chainId,
        ...(gasLimit > 0n ? { gasLimit } : {}),
        ...(gasFees.type === "eip1559"
          ? {
              maxFeePerGas: gasFees.maxFeePerGas,
              maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
              type: 2,
            }
          : { gasPrice: gasFees.gasPrice, type: 0 }),
      } as ethers.TransactionRequest;
    },
  );

  if (!historyResult.success) {
    log.error(tag, `Failed to record closure history`, {
      positionId: stats.positionId,
      error: historyResult.error,
      attempts: historyResult.attempts,
    });
    return historyResult;
  }

  log.info(tag, `Closure history recorded`, {
    positionId: stats.positionId,
    txHash: historyResult.txHash,
  });

  // ── Step 2: Return margin to user with PnL settlement ─────────────────────
  const marginWei = ethers.parseUnits(stats.positionSize, 18);

  const marginResult = await sendWithRetry(
    `${tag}:margin`,
    async (nonce, gasFees, gasLimit) => {
      const txData = contract.interface.encodeFunctionData("returnMargin", [
        stats.walletAddress,
        marginWei,
        pnlWei,
      ]);

      return {
        from: wallet.address,
        to: config.perpDexAddress,
        data: txData,
        nonce,
        chainId: config.chainId,
        ...(gasLimit > 0n ? { gasLimit } : {}),
        ...(gasFees.type === "eip1559"
          ? {
              maxFeePerGas: gasFees.maxFeePerGas,
              maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
              type: 2,
            }
          : { gasPrice: gasFees.gasPrice, type: 0 }),
      } as ethers.TransactionRequest;
    },
  );

  if (!marginResult.success) {
    log.error(tag, `Failed to return margin`, {
      positionId: stats.positionId,
      wallet: stats.walletAddress,
      error: marginResult.error,
    });
  } else {
    log.action(tag, `Margin returned to user`, {
      positionId: stats.positionId,
      wallet: stats.walletAddress,
      margin: `${stats.positionSize} zUSDC`,
      pnl: stats.pnl,
      txHash: marginResult.txHash,
    });
  }

  // ── Step 3: Claim accumulated keeper reward ───────────────────────────────
  try {
    const pendingReward = await contract.pendingKeeperReward(wallet.address) as bigint;

    if (pendingReward > 0n) {
      log.info(tag, `Pending keeper reward`, {
        amount: `${ethers.formatUnits(pendingReward, 18)} zUSDC`,
      });

      const claimResult = await sendWithRetry(
        `${tag}:claim-reward`,
        async (nonce, gasFees, gasLimit) => {
          const txData = contract.interface.encodeFunctionData("claimKeeperReward", []);

          return {
            from: wallet.address,
            to: config.perpDexAddress,
            data: txData,
            nonce,
            chainId: config.chainId,
            ...(gasLimit > 0n ? { gasLimit } : {}),
            ...(gasFees.type === "eip1559"
              ? {
                  maxFeePerGas: gasFees.maxFeePerGas,
                  maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
                  type: 2,
                }
              : { gasPrice: gasFees.gasPrice, type: 0 }),
          } as ethers.TransactionRequest;
        },
        { ...DEFAULT_RETRY, maxAttempts: 2 },
      );

      if (claimResult.success) {
        log.action(tag, `Keeper reward claimed`, {
          amount: `${ethers.formatUnits(pendingReward, 18)} zUSDC`,
          txHash: claimResult.txHash,
        });
      } else {
        log.warn(tag, `Keeper reward claim failed (non-blocking)`, {
          error: claimResult.error,
        });
      }
    }
  } catch (err) {
    log.warn(tag, `Could not check/claim keeper reward`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return historyResult;
}

/**
 * Get the current keeper wallet balance and pending reward for monitoring.
 */
export async function getKeeperStatus(): Promise<{
  address: string;
  nativeBalance: string;
  pendingReward: string;
}> {
  const [balance, reward] = await Promise.all([
    provider.getBalance(wallet.address),
    contract.pendingKeeperReward(wallet.address).catch(() => 0n) as Promise<bigint>,
  ]);

  return {
    address: wallet.address,
    nativeBalance: ethers.formatEther(balance),
    pendingReward: ethers.formatUnits(reward, 18),
  };
}
