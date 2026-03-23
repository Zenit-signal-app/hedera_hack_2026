import type { PublicClient } from "viem";

/**
 * `waitForTransactionReceipt` **không** ném lỗi khi tx revert — phải kiểm tra `status`.
 * Nếu không, UI báo "thành công" trong khi chỉ trừ phí gas (Hedera/EVM).
 */
export async function waitForTransactionSuccess(
  publicClient: PublicClient,
  hash: `0x${string}`,
  context: string,
): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(
      `${context}: giao dịch revert on-chain (thường chỉ thấy trừ phí). Nguyên nhân hay gặp: slippage quá chặt, chưa associate token USDC/HTS, pool mỏng, hoặc sai path. Mở HashScan với hash để xem chi tiết.`,
    );
  }
}
