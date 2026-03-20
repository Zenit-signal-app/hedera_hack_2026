import { useState, useEffect } from "react";
import { getPriceFromPythBenchmarks, type AssetPrice } from "@/services/polkadotPrice";
import type { PolkadotSymbol } from "./usePolkadotPrices";

const REFRESH_INTERVAL_MS = 10000; // 10 giây - đồng bộ với chart

/**
 * Lấy giá từ Pyth Benchmarks (cùng nguồn với TradingView chart)
 * Đảm bảo ô giá và biểu đồ hiển thị cùng mức giá
 */
export function useChartPrice(symbol: PolkadotSymbol) {
  const [price, setPrice] = useState<AssetPrice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const result = await getPriceFromPythBenchmarks(symbol);
        if (!cancelled && result) {
          setPrice(result);
        } else if (!cancelled) {
          setPrice(null);
        }
      } catch {
        if (!cancelled) setPrice(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  return { price, loading };
}
