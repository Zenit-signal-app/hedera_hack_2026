import "dotenv/config";
import type { Market, PriceTick } from "./types.js";
import { config } from "./config.js";
import { log } from "./logger.js";

// ─── Pyth Hermes price IDs ──────────────────────────────────────────────────
function normalizePythFeedId(maybeId: string): string {
  const trimmed = maybeId.trim();
  if (!trimmed) throw new Error("Empty Pyth feed id");
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

// Pyth feed IDs are configurable for flexibility.
// If a feed ID is missing, we simply won't fetch a price for that market.
const PYTH_PRICE_IDS: Partial<Record<Market, string>> = {
  BTCUSD: normalizePythFeedId("e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"),
  ETHUSD: normalizePythFeedId("ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"),
  HBARUSD: normalizePythFeedId(process.env.PYTH_HBAR_USD_FEED_ID ?? "3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd"),
};

// ─── Chainlink-style on-chain aggregator addresses ───────────────────────────
const envChainlinkFeeds: Partial<Record<Market, string | undefined>> = {
  BTCUSD: process.env.BTC_USD_FEED,
  ETHUSD: process.env.ETH_USD_FEED,
};

const DEFAULT_CHAINLINK_FEEDS: Partial<Record<Market, `0x${string}`>> = {
  BTCUSD: "0x1191079555C0c6D123D190300A13A46522744E67",
  ETHUSD: "0xab889d1b672727142E9432616a2E445F03d4E627",
};

const CHAINLINK_FEEDS: Partial<Record<Market, `0x${string}`>> = {
  BTCUSD: (envChainlinkFeeds.BTCUSD ?? DEFAULT_CHAINLINK_FEEDS.BTCUSD) as `0x${string}`,
  ETHUSD: (envChainlinkFeeds.ETHUSD ?? DEFAULT_CHAINLINK_FEEDS.ETHUSD) as `0x${string}`,
};

const CHAINLINK_AGG_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── Pyth Hermes v2 fetch (primary – works on any chain) ─────────────────────

async function fetchPythPrices(): Promise<PriceTick[]> {
  const idEntries = Object.entries(PYTH_PRICE_IDS).filter(
    (entry): entry is [Market, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );
  if (idEntries.length === 0) return [];

  const params = idEntries.map(([_market, id]) => `ids[]=${id}`).join("&");
  const base = (config.pythEndpoint ?? "https://hermes.pyth.network").replace(/\/$/, "");

  const res = await fetch(`${base}/v2/updates/price/latest?${params}`);
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

  const data = (await res.json()) as {
    parsed?: Array<{
      id: string;
      price: { price: string; expo?: number };
    }>;
  };
  const parsed = data.parsed ?? [];
  if (parsed.length === 0) throw new Error("Pyth returned no parsed prices");

  const idToMarket = Object.fromEntries(
    idEntries.map(([market, id]) => [id, market]),
  ) as Record<string, Market>;

  const ticks: PriceTick[] = parsed
    .map((feed) => {
      const market = idToMarket[feed.id];
      if (!market) return null;
      const raw = Number(feed.price.price);
      const expo = feed.price.expo ?? -8;
      return {
        market,
        price: raw * 10 ** expo,
        timestamp: Date.now(),
      };
    })
    .filter((t): t is PriceTick => t != null);

  return ticks;
}

// ─── Chainlink fetch (alternative – requires on-chain read) ─────────────────

let chainlinkClient: ReturnType<typeof import("viem").createPublicClient> | null = null;

async function getChainlinkClient() {
  if (chainlinkClient) return chainlinkClient;
  const { createPublicClient, http, defineChain } = await import("viem");
  const chain = defineChain({
    id: config.chainId,
    name: "Polkadot Hub TestNet",
    nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 10 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  chainlinkClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  return chainlinkClient;
}

async function fetchChainlinkPrices(): Promise<PriceTick[]> {
  const client = await getChainlinkClient();
  const { getAddress } = await import("viem");
  const markets = Object.keys(CHAINLINK_FEEDS) as Market[];
  const ticks: PriceTick[] = [];

  for (const market of markets) {
    try {
      const addr = getAddress(CHAINLINK_FEEDS[market]!);
      const [, answer] = (await client.readContract({
        address: addr,
        abi: CHAINLINK_AGG_ABI,
        functionName: "latestRoundData",
      })) as [bigint, bigint, bigint, bigint, bigint];

      const decimals = (await client.readContract({
        address: addr,
        abi: CHAINLINK_AGG_ABI,
        functionName: "decimals",
      })) as number;

      const price = Number(answer) / 10 ** decimals;
      ticks.push({ market, price, timestamp: Date.now() });
    } catch (err) {
      log.warn("price", `Chainlink feed unavailable for ${market}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ticks;
}

// ─── DIA Oracle (fallback – off-chain, works on any network) ─────────────────

const DIA_ASSETS: Partial<Record<Market, string>> = {
  BTCUSD: "Bitcoin",
  ETHUSD: "Ethereum",
};

async function fetchDiaPrices(): Promise<PriceTick[]> {
  const markets = Object.keys(DIA_ASSETS) as Market[];
  const ticks: PriceTick[] = [];

  for (const market of markets) {
    try {
      const asset = DIA_ASSETS[market];
      if (!asset) continue;
      const res = await fetch(
        `https://api.diadata.org/v1/assetQuotation/${asset}/0x0000000000000000000000000000000000000000`,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { Price?: number };
      if (data.Price != null) {
        ticks.push({ market, price: Number(data.Price), timestamp: Date.now() });
      }
    } catch (err) {
      log.warn("price", `DIA fetch failed for ${market}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ticks;
}

// ─── Public API: Pyth → Chainlink → DIA ─

export async function fetchPrices(): Promise<PriceTick[]> {
  try {
    const ticks = await fetchPythPrices();
    if (ticks.length > 0) {
      log.info("price", `Pyth prices fetched`, {
        prices: Object.fromEntries(ticks.map((t) => [t.market, `$${t.price.toFixed(2)}`])),
      });
      return ticks;
    }
  } catch (err) {
    log.warn("price", "Pyth feed failed, trying Chainlink", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const ticks = await fetchChainlinkPrices();
    if (ticks.length > 0) {
      log.info("price", `Chainlink prices fetched`, {
        prices: Object.fromEntries(ticks.map((t) => [t.market, `$${t.price.toFixed(2)}`])),
      });
      return ticks;
    }
  } catch (err) {
    log.warn("price", "Chainlink feed failed, trying DIA", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const ticks = await fetchDiaPrices();
    if (ticks.length > 0) {
      log.info("price", `DIA prices fetched`, {
        prices: Object.fromEntries(ticks.map((t) => [t.market, `$${t.price.toFixed(2)}`])),
      });
      return ticks;
    }
  } catch (err) {
    log.warn("price", "DIA feed failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  log.error("price", "All price feeds failed");
  return [];
}
