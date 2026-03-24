import { useEffect, useRef, useState } from "react";
import { FootprintBar, FootprintCluster, FootprintState } from "@/hooks/binanceFootprintTypes";

const BINANCE_FOOTPRINT_URL = "wss://fstream.binance.com/ws/btcusdt@aggTrade";

export class BinanceFootprintManager {
  private timeframeSeconds: number;
  private clusters: Map<string, FootprintCluster> = new Map();
  private barStart: number = 0;
  private barEnd: number = 0;
  private open: number | null = null;
  private high: number = Number.NEGATIVE_INFINITY;
  private low: number = Number.POSITIVE_INFINITY;
  private close: number | null = null;
  private priceBin: number;

  constructor(timeframeSeconds: number, priceBin: number) {
    this.timeframeSeconds = timeframeSeconds;
    this.priceBin = priceBin;
    this.resetBar(Date.now() / 1000);
  }

  public resetBar(timestamp: number) {
    const aligned = Math.floor(timestamp / this.timeframeSeconds) * this.timeframeSeconds;
    this.barStart = aligned;
    this.barEnd = aligned + this.timeframeSeconds;
    this.open = null;
    this.high = Number.NEGATIVE_INFINITY;
    this.low = Number.POSITIVE_INFINITY;
    this.close = null;
    this.clusters = new Map();
  }

  public processTrade(trade: any): FootprintBar | null {
    const ts = trade.T / 1000;
    let finishedBar: FootprintBar | null = null;
    if (ts >= this.barEnd) {
      finishedBar = this.finishBar();
      this.resetBar(ts);
    }
    const price = Number(trade.p);
    const levelPrice = Math.round(price / this.priceBin) * this.priceBin;
    const qty = Number(trade.q);
    if (this.open === null) {
      this.open = price;
    }
    this.high = Math.max(this.high, levelPrice);
    this.low = Math.min(this.low, levelPrice);
    this.close = price;
    const decimals = Math.max(0, -Math.floor(Math.log10(this.priceBin)));
    const level = levelPrice.toFixed(decimals);
    const channel = this.clusters.get(level) ?? { buy_vol: 0, sell_vol: 0, total_vol: 0 };
    const sideKey = trade.m ? "sell_vol" : "buy_vol";
    channel[sideKey] += qty;
    channel.total_vol += qty;
    this.clusters.set(level, channel);
    return finishedBar;
  }

  private finishBar(): FootprintBar | null {
    if (this.open === null || this.close === null) return null;
    const clusters = this.snapshotClusters();
    let vpocLevel = "";
    let vpocVol = 0;
    for (const [level, data] of Object.entries(clusters)) {
      if (data.total_vol > vpocVol) {
        vpocVol = data.total_vol;
        vpocLevel = level;
      }
    }
    return {
      barStart: this.barStart,
      barEnd: this.barEnd,
      open: this.open,
      high: this.high === Number.NEGATIVE_INFINITY ? this.open : this.high,
      low: this.low === Number.POSITIVE_INFINITY ? this.open : this.low,
      close: this.close,
      clusters,
      vpocPrice: vpocLevel,
    };
  }

  public getStateSnapshot(): FootprintState {
    return {
      barStart: this.barStart,
      barEnd: this.barEnd,
      open: this.open ?? undefined,
      high: this.high === Number.NEGATIVE_INFINITY ? undefined : this.high,
      low: this.low === Number.POSITIVE_INFINITY ? undefined : this.low,
      close: this.close ?? undefined,
      clusters: this.snapshotClusters(),
    };
  }

  private snapshotClusters(): Record<string, FootprintCluster> {
    return Array.from(this.clusters.entries()).reduce<Record<string, FootprintCluster>>(
      (acc, [price, cluster]) => {
        acc[price] = { ...cluster };
        return acc;
      },
      {}
    );
  }
  public setPriceBin(bin: number) {
    this.priceBin = bin;
    this.resetBar(Date.now() / 1000);
  }
}

export default function useBinanceFootprint(timeframeSeconds = 60, priceBin = 0.01) {
  const [state, setState] = useState<FootprintState>(() => {
    const aligned = Math.floor(Date.now() / timeframeSeconds) * timeframeSeconds;
    return {
      barStart: aligned,
      barEnd: aligned + timeframeSeconds,
      clusters: {},
    };
  });
  const managerRef = useRef<BinanceFootprintManager | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const shouldReconnect = useRef(true);

  useEffect(() => {
    managerRef.current = new BinanceFootprintManager(timeframeSeconds, priceBin);
    shouldReconnect.current = true;
    const connect = () => {
      const ws = new WebSocket(BINANCE_FOOTPRINT_URL);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
      const completedBar = managerRef.current?.processTrade(payload);
          if (!managerRef.current) return;
          const snapshot = managerRef.current.getStateSnapshot();
          setState({
            ...snapshot,
        lastVpocPrice: completedBar?.vpocPrice,
        lastVpocVolume:
          completedBar?.vpocPrice ? completedBar.clusters[completedBar.vpocPrice]?.total_vol : undefined,
          });
        } catch (error) {
          console.error("Footprint parse error", error);
        }
      };
      ws.onclose = () => {
        if (shouldReconnect.current) {
          reconnectTimer.current = window.setTimeout(() => connect(), 1000);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    };
    connect();
    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [timeframeSeconds, priceBin]);

  return state;
}
