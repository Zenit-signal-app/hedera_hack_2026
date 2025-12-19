"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface ChartHeaderProps {
  symbol: string;
  currentPrice?: string;
  priceChange?: string;
  priceChangePercent?: string;
  onSymbolChange?: (symbol: string) => void;
  onIntervalChange?: (interval: string) => void;
  currentInterval?: string;
}

const TIMEFRAMES = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "30m", value: "30" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1d", value: "1D" },
  { label: "1w", value: "1W" },
];

export default function ChartHeader({
  symbol,
  currentPrice,
  priceChange,
  priceChangePercent,
  onSymbolChange,
  onIntervalChange,
  currentInterval = "60",
}: ChartHeaderProps) {
  const [selectedInterval, setSelectedInterval] = useState(currentInterval);

  const handleIntervalChange = (interval: string) => {
    setSelectedInterval(interval);
    onIntervalChange?.(interval);
  };

  const isPositive = priceChange ? parseFloat(priceChange) >= 0 : true;

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-dark-gray-700">
      {/* Left - Symbol & Price Info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">{symbol}</h3>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>

        {currentPrice && (
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-white">{currentPrice}</span>
            {priceChange && priceChangePercent && (
              <div
                className={`flex items-center gap-1 text-sm ${
                  isPositive ? "text-green-500" : "text-red-500"
                }`}
              >
                <span>{isPositive ? "+" : ""}{priceChange}</span>
                <span>({isPositive ? "+" : ""}{priceChangePercent}%)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right - Timeframe Selector */}
      <div className="flex items-center gap-1 bg-dark-gray-800 rounded-lg p-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            onClick={() => handleIntervalChange(tf.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === tf.value
                ? "bg-primary-blue text-white"
                : "text-gray-400 hover:text-white hover:bg-dark-gray-700"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>
    </div>
  );
}
