/**
 * aggregatorRouteTransformer.ts
 *
 * Implements the three-step HBAR swap pipeline described in the boilerplate:
 *
 *  Step 1 – Auto-wrap: if tokenIn === HBAR, inject a deposit() call first.
 *  Step 2 – Balance check: verify native HBAR (for HBAR sells) or ERC-20
 *            balance (for all other tokens) before allowing swap.
 *  Step 3 – UI action: return enough context for the UI to either show
 *            a "Wrap HBAR" button or execute wrap automatically in one chain.
 */

// ─── Gas constants (mirror Python boilerplate) ───────────────────────────────
/** Tinybars reserved for network fees (5 HBAR = 5 × 10^8 tinybars). */
export const GAS_BUFFER_TINYBARS = 5n * 10n ** 8n;

/** Same value in weibars (18-decimal EVM unit used by wagmi / viem). */
export const GAS_BUFFER_WEI = GAS_BUFFER_TINYBARS * 10n ** 10n; // 5 × 10^18

/** Soft warning threshold: balance drops below this after swap (2 HBAR). */
export const LOW_BALANCE_WARN_WEI = 2n * 10n ** 18n;

// ─── Types ───────────────────────────────────────────────────────────────────

export type BalanceCheckKind =
  | "ok"           // balance sufficient, no action needed
  | "wrap_needed"  // HBAR sell: need deposit() wrap first
  | "low_balance"  // swap ok, but balance will be tight after fees
  | "insufficient" // balance too low to cover amount + gas buffer
  | "no_balance";  // cannot read balance at all

export interface RouteStep {
  fromToken: string; // token symbol or EVM address
  toToken: string;
}

export interface SwapConfig {
  /** EVM address of the connected wallet. */
  userAddress: string;
  /**
   * Amount to sell, in the sell-token's smallest unit:
   * – HBAR / WHBAR: tinybars (8 decimals, matches ERC-20 balanceOf)
   * – USDC: 6-decimal units
   * – other ERC-20: their own decimals
   */
  inputAmountTiny: bigint;
  /** Native HBAR balance in weibars (18 decimals, from eth_getBalance). */
  nativeHbarBalanceWei: bigint | null;
  /** ERC-20 `balanceOf` result (tinybars for WHBAR, token units for others). */
  erc20BalanceTiny: bigint | null;
  /** Is tokenIn native HBAR? */
  isNativeHbar: boolean;
}

export interface RouteTransformResult {
  /** Final route to execute (may have a wrap step prepended). */
  finalRoute: RouteStep[];
  /**
   * Effective sell amount after gas-buffer adjustment (same unit as inputAmountTiny).
   * May be smaller than the user's input when the wallet is nearly empty.
   */
  adjustedAmountTiny: bigint;
  /** Whether a deposit() call must precede the swap. */
  needsWrap: boolean;
  /** Amount to wrap, in tinybars (fed straight to executePayableContractCall). */
  wrapAmountTinybars: bigint;
  /** Balance check outcome — drives Step 3 UI logic. */
  balanceCheck: BalanceCheckKind;
  /** Human-readable explanation for the UI (empty string = no message). */
  message: string;
}

// ─── Core transformer ────────────────────────────────────────────────────────

/**
 * Implements Steps 1–2 from the boilerplate.
 *
 * @param initialRoute  Route produced by the quote engine (e.g. [HBAR→USDC]).
 * @param config        Wallet balances and input amount.
 * @param whbarAddress  EVM address of the WHBAR contract (0x…).
 */
export function transformRouteWithGasCheck(
  initialRoute: RouteStep[],
  config: SwapConfig,
  whbarAddress: string,
): RouteTransformResult {
  const finalRoute = [...initialRoute];
  let adjustedAmountTiny = config.inputAmountTiny;
  let needsWrap = false;
  let wrapAmountTinybars = 0n;

  if (finalRoute.length === 0) {
    return {
      finalRoute,
      adjustedAmountTiny,
      needsWrap,
      wrapAmountTinybars,
      balanceCheck: "insufficient",
      message: "Empty route — cannot proceed.",
    };
  }

  // ── Step 1: HBAR sell → must wrap ──────────────────────────────────────────
  if (config.isNativeHbar) {
    needsWrap = true;

    const nativeBal = config.nativeHbarBalanceWei ?? 0n;

    // Convert sell amount tinybars → weibars for comparison with nativeBal
    const sellWei = config.inputAmountTiny * 10n ** 10n;
    const totalNeededWei = sellWei + GAS_BUFFER_WEI;

    // Not enough native HBAR at all
    if (nativeBal < GAS_BUFFER_WEI + 10n ** 15n /* ~0.001 HBAR min */) {
      return {
        finalRoute,
        adjustedAmountTiny,
        needsWrap,
        wrapAmountTinybars,
        balanceCheck: "insufficient",
        message: `Insufficient HBAR. Need at least ${Number(GAS_BUFFER_WEI) / 1e18} HBAR for gas fees.`,
      };
    }

    // Amount exceeds balance minus gas buffer → auto-reduce
    if (nativeBal < totalNeededWei) {
      const maxWei = nativeBal - GAS_BUFFER_WEI;
      adjustedAmountTiny = maxWei / 10n ** 10n; // back to tinybars
      const maxHuman = Number(maxWei) / 1e18;
      wrapAmountTinybars = adjustedAmountTiny;

      // Inject wrap step
      const wrapStep: RouteStep = { fromToken: "HBAR", toToken: whbarAddress };
      finalRoute[0] = { ...finalRoute[0], fromToken: whbarAddress };
      finalRoute.unshift(wrapStep);

      return {
        finalRoute,
        adjustedAmountTiny,
        needsWrap,
        wrapAmountTinybars,
        balanceCheck: "wrap_needed",
        message: `Amount reduced to ${maxHuman.toFixed(4)} HBAR (reserving ${Number(GAS_BUFFER_WEI) / 1e18} HBAR for gas).`,
      };
    }

    wrapAmountTinybars = adjustedAmountTiny;

    // Inject wrap step at front of route
    const wrapStep: RouteStep = { fromToken: "HBAR", toToken: whbarAddress };
    finalRoute[0] = { ...finalRoute[0], fromToken: whbarAddress };
    finalRoute.unshift(wrapStep);

    // Soft warning: remaining HBAR after swap is low
    const remainingWei = nativeBal - totalNeededWei;
    if (remainingWei < LOW_BALANCE_WARN_WEI) {
      return {
        finalRoute,
        adjustedAmountTiny,
        needsWrap,
        wrapAmountTinybars,
        balanceCheck: "low_balance",
        message: `Low balance after swap — only ~${(Number(remainingWei) / 1e18).toFixed(2)} HBAR will remain.`,
      };
    }

    return {
      finalRoute,
      adjustedAmountTiny,
      needsWrap,
      wrapAmountTinybars,
      balanceCheck: "wrap_needed",
      message: "",
    };
  }

  // ── Step 2: ERC-20 sell (WHBAR, USDC, SAUCE …) ────────────────────────────
  const erc20Bal = config.erc20BalanceTiny ?? 0n;
  const nativeBal = config.nativeHbarBalanceWei ?? 0n;

  // Must have some native HBAR for gas even when selling tokens
  if (nativeBal < GAS_BUFFER_WEI) {
    return {
      finalRoute,
      adjustedAmountTiny,
      needsWrap,
      wrapAmountTinybars,
      balanceCheck: "insufficient",
      message: `Need at least ${Number(GAS_BUFFER_WEI) / 1e18} HBAR in wallet to pay for transaction fees.`,
    };
  }

  if (config.erc20BalanceTiny === null) {
    return {
      finalRoute,
      adjustedAmountTiny,
      needsWrap,
      wrapAmountTinybars,
      balanceCheck: "no_balance",
      message: "Could not read token balance — check wallet connection.",
    };
  }

  if (erc20Bal < adjustedAmountTiny) {
    return {
      finalRoute,
      adjustedAmountTiny,
      needsWrap,
      wrapAmountTinybars,
      balanceCheck: "insufficient",
      message: "Insufficient token balance for this swap.",
    };
  }

  return {
    finalRoute,
    adjustedAmountTiny,
    needsWrap,
    wrapAmountTinybars,
    balanceCheck: "ok",
    message: "",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true when tokenIn symbol represents native HBAR. */
export function needsHbarWrap(tokenInSymbol: string): boolean {
  return tokenInSymbol.trim().toUpperCase() === "HBAR";
}

/** Format a route array into a human-readable string: "HBAR → WHBAR → USDC". */
export function formatRouteDisplay(route: RouteStep[]): string {
  if (route.length === 0) return "";
  const tokens = [route[0].fromToken, ...route.map((s) => s.toToken)];
  return tokens.join(" → ");
}
