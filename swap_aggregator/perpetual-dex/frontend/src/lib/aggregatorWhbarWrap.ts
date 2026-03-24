/**
 * Hedera WHBAR: số dư ERC-20 dùng **tinybars** (8 decimals); `deposit()` nhận **weibars** (18 decimals).
 * 1 HBAR = 10^8 tinybars = 10^18 weibars ⇒ weibar = tinybar × 10^10.
 */
export const WEIBARS_PER_TINYBAR = 10n ** 10n;

/** tinybars (WHBAR `balanceOf` / amountIn) → wei gửi kèm `deposit()` / `value` */
export function whbarTinybarsToDepositWeibar(tinybars: bigint): bigint {
  return tinybars * WEIBARS_PER_TINYBAR;
}
