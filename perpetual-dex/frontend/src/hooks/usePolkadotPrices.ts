import { useState, useEffect } from "react";
import { getAllPolkadotPrices, type AssetPrice, type PolkadotSymbol } from "@/services/polkadotPrice";

const REFRESH_INTERVAL_MS = 15000; // 15 giây

export function usePolkadotPrices() {
  const [prices, setPrices] = useState<Record<PolkadotSymbol, AssetPrice>>({} as Record<PolkadotSymbol, AssetPrice>);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrices() {
      try {
        setError(null);
        const result = await getAllPolkadotPrices();
        if (!cancelled && result) {
          setPrices(result);
        } else if (!cancelled && Object.keys(result || {}).length === 0) {
          setError("Không thể lấy giá");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Lỗi");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const getPrice = (symbol: PolkadotSymbol): AssetPrice | undefined => prices[symbol];

  return { prices, loading, error, getPrice };
}

export type { PolkadotSymbol } from "@/services/polkadotPrice";
