import { useState } from "react";

/**
 * Known token logos for the liquidity aggregator (Hedera / SaucerSwap ecosystem).
 * URLs from CoinGecko public CDN — update if assets move.
 */
const AGGREGATOR_TOKEN_ICON_URLS: Readonly<Record<string, string>> = {
  HBAR: "https://coin-images.coingecko.com/coins/images/3688/large/hbar.png?1696504364",
  WHBAR: "https://coin-images.coingecko.com/coins/images/30042/large/whbar.png?1696528965",
  USDC: "https://coin-images.coingecko.com/coins/images/6319/large/USDC.png?1769615602",
  SAUCE: "https://coin-images.coingecko.com/coins/images/27401/large/SAUCE_ICON_FINAL_200x200.png?1748588084",
  XSAUCE: "https://coin-images.coingecko.com/coins/images/28569/large/xSAUCE_icon_2x.png?1760163830",
};

export function getAggregatorTokenIconUrl(symbol: string): string | undefined {
  const k = symbol.trim().toUpperCase();
  return AGGREGATOR_TOKEN_ICON_URLS[k];
}

function FallbackGlyph({ symbol, sizeClassName }: { symbol: string; sizeClassName: string }) {
  const s = symbol.trim().toUpperCase();
  const hue = s.includes("HBAR")
    ? "from-[#3d5a5a] to-[#1e3a3a]"
    : s.includes("USDC")
      ? "from-[#2775ca] to-[#1a4d8c]"
      : "from-[#4b5563] to-[#1f2937]";
  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${hue} text-[11px] font-bold text-white shadow-inner ring-1 ring-white/10`}
      aria-hidden
    >
      {s.slice(0, 4)}
    </span>
  );
}

type AggregatorTokenIconProps = {
  symbol: string;
  className?: string;
  sizeClassName?: string;
};

/**
 * Token logo when we have a URL; otherwise gradient initials (same as before).
 */
export function AggregatorTokenIcon({
  symbol,
  className = "",
  sizeClassName = "h-9 w-9",
}: AggregatorTokenIconProps) {
  const s = symbol.trim().toUpperCase();
  const url = getAggregatorTokenIconUrl(s);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <span className={className}>
        <FallbackGlyph symbol={symbol} sizeClassName={sizeClassName} />
      </span>
    );
  }

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/25 ring-1 ring-white/10 ${sizeClassName} ${className}`}
    >
      <img
        src={url}
        alt={s}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
