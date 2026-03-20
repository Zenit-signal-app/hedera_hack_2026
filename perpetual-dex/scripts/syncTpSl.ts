/**
 * Sync TP/SL for an open position with the keeper.
 * Use when a position was opened before keeper started or TP/SL sync failed.
 *
 * Usage:
 *   npx tsx scripts/syncTpSl.ts
 *
 * Or with env vars:
 *   KEEPER_URL=http://localhost:3100 WALLET=0x... MARKET=DOTUSD TP=1.6237 SL=1.6224 npx tsx scripts/syncTpSl.ts
 */

const KEEPER_URL = process.env.KEEPER_URL ?? "http://localhost:3100";
const WALLET = process.env.WALLET ?? process.env.WALLET_ADRESS ?? "0x03E3BDBA0D383c11Be08aE56D72BD9B185343017";
const MARKET = process.env.MARKET ?? "BTCUSD";
const TP = process.env.TP != null ? parseFloat(process.env.TP) : null;
const SL = process.env.SL != null ? parseFloat(process.env.SL) : null;

async function main() {
  if (TP == null && SL == null) {
    console.error("Set TP and/or SL via env: MARKET=BTCUSD TP=73919.30 SL=73860.19 npx tsx scripts/syncTpSl.ts");
    process.exit(1);
  }
  const base = KEEPER_URL.replace(/\/$/, "");
  const body = JSON.stringify({
    walletAddress: WALLET,
    market: MARKET,
    takeProfitPrice: TP,
    stopLossPrice: SL,
  });

  console.log("Syncing TP/SL with keeper...", { WALLET, MARKET, TP, SL });

  // Try tp-sl first (updates existing order)
  let res = await fetch(`${base}/orders/tp-sl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (res.status === 404) {
    console.log("No open order found, trying sync (creates from chain)...");
    res = await fetch(`${base}/orders/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  if (!res.ok) {
    const text = await res.text();
    console.error("Sync failed:", res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log("Sync OK:", JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
