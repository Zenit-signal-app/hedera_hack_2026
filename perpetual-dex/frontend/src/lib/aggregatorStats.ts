/**
 * Optional dashboard stats from your backend (REST JSON).
 */

export type AggregatorStatsDisplay = {
  volume: string;
  trades: string;
  liquidityProviders: string;
  uniqueUsers: string;
};

/** Rút gọn số lớn cho hiển thị (K / M). */
export function formatStatDigits(raw: string): string {
  const value = raw.replace(/\D/g, "");
  if (value.length < 4) return raw;
  if (value.length < 5) return `${value.substring(0, 1)}.${value.substring(1, 2)}K`;
  if (value.length < 7) return `${value.substring(0, value.length - 3)}K`;
  if (value.length < 8) return `${value.substring(0, 1)}.${value.substring(1, 2)}M`;
  return `${value.substring(0, value.length - 6)}M`;
}

/** Parse JSON linh hoạt: hỗ trợ nhiều tên trường cho cùng một chỉ số. */
export async function fetchAggregatorStats(url: string): Promise<AggregatorStatsDisplay | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const volume =
      pickStr(data, ["volume", "totalVolumeUsd", "total_volume_usd"]) ?? "0";
    const trades = pickStr(data, ["amount_of_trades", "trades", "tradeCount"]) ?? "0";
    const liquidityProviders =
      pickStr(data, ["liquidity_providers", "liquidityProviders", "lpCount"]) ?? "0";
    const uniqueUsers = pickStr(data, ["unique_users", "uniqueUsers", "users"]) ?? "0";

    const volStr =
      typeof volume === "string" && volume.includes(".")
        ? volume.split(".")[0] ?? volume
        : String(volume).replace(/\D/g, "") || "0";

    return {
      volume: formatStatDigits(volStr),
      trades: formatStatDigits(String(trades).replace(/\D/g, "") || "0"),
      liquidityProviders: formatStatDigits(String(liquidityProviders).replace(/\D/g, "") || "0"),
      uniqueUsers: formatStatDigits(String(uniqueUsers).replace(/\D/g, "") || "0"),
    };
  } catch {
    return null;
  }
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && (typeof v === "string" || typeof v === "number")) return String(v);
  }
  return undefined;
}
