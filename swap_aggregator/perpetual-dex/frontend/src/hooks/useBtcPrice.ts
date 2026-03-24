import { useState, useEffect } from "react";
import { getBtcUsdPrice, type BtcUsdPrice } from "@/services/polkadotPrice";

const REFRESH_INTERVAL_MS = 15000; // 15 giây

export function useBtcPrice() {
  const [price, setPrice] = useState<BtcUsdPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        setError(null);
        const result = await getBtcUsdPrice();
        if (!cancelled && result) {
          setPrice(result);
        } else if (!cancelled && !result) {
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

    fetchPrice();
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { price, loading, error };
}
