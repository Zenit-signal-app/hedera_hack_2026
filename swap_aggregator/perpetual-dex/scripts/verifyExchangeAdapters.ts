/**
 * Đọc `Exchange.adapters(bytes32)` cho các id Zenit thường dùng — không cần redeploy Exchange
 * nếu chỉ sai id: chạy `register:adapter:mainnet` hoặc `setAdapter` đúng label.
 *
 * frontend/.env (Hardhat):
 *   AGGREGATOR_EXCHANGE_ADDRESS=0x...  hoặc  VITE_AGGREGATOR_EXCHANGE_CONTRACT
 *
 * Chạy:
 *   npx hardhat run scripts/verifyExchangeAdapters.ts --network hederaMainnet
 */
import { ethers } from "hardhat";

const LABELS = ["saucerswap", "saucerswap_v2", "v2"] as const;

async function main() {
  const exchangeAddr =
    process.env.AGGREGATOR_EXCHANGE_ADDRESS?.trim() ||
    process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT?.trim();
  if (!exchangeAddr || !/^0x[a-fA-F0-9]{40}$/.test(exchangeAddr)) {
    throw new Error(
      "Set AGGREGATOR_EXCHANGE_ADDRESS or VITE_AGGREGATOR_EXCHANGE_CONTRACT to Exchange (0x...).",
    );
  }

  const exchange = await ethers.getContractAt("Exchange", exchangeAddr);
  const net = await ethers.provider.getNetwork();

  console.log("Network chainId:", net.chainId.toString());
  console.log("Exchange:  ", exchangeAddr);
  console.log("");

  for (const label of LABELS) {
    const id = ethers.encodeBytes32String(label.slice(0, 31));
    const cfg = await exchange.adapters(id);
    const adapter = cfg[0] as string;
    const active = cfg[1] as boolean;
    const ok = active && adapter !== ethers.ZeroAddress;
    console.log(
      `${ok ? "✓" : "✗"} adapters(${JSON.stringify(label)}) → adapter=${adapter} active=${active}`,
    );
  }

  console.log("");
  console.log(
    "Nếu `saucerswap` hoặc `saucerswap_v2` là ✗: UI sẽ gửi id đó cho QuoteAggregator.quote — cần deploy adapter + setAdapter.",
  );
  console.log("  npm run register:adapter:mainnet        # V1 id mặc định saucerswap");
  console.log("  npm run register:adapter:v3:mainnet     # CLMM id saucerswap_v2");
  console.log("");
  console.log(
    "Nếu chỉ thấy ✓ `v2` mà không có `saucerswap`: deploy stack cũ dùng ADAPTER_ID_V2=v2 — chạy registerV2Adapter (id=saucerswap) hoặc setAdapter lại.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
