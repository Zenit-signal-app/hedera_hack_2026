export interface FootprintCluster {
  buy_vol: number;
  sell_vol: number;
  total_vol: number;
}

export interface FootprintBar {
  barStart: number;
  barEnd: number;
  open: number;
  high: number;
  low: number;
  close: number;
  clusters: Record<string, FootprintCluster>;
  vpocPrice?: string;
}

export interface FootprintState {
  barStart?: number;
  barEnd?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  clusters: Record<string, FootprintCluster>;
  lastVpocPrice?: string;
  lastVpocVolume?: number;
}
