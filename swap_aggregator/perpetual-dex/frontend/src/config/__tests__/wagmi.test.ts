import { describe, expect, it } from "vitest";

import { hederaMainnet, hederaTestnet, polkadotEVMTestnet } from "../wagmi";

describe("defineChain metadata", () => {
  it("keeps HashPack-friendly metadata for Hedera Testnet (296)", () => {
    expect(hederaTestnet).toMatchObject({
      id: 296,
      name: "Hedera Testnet",
      nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    });
    /** Dev: proxy `/hedera-rpc/testnet`; CI/prod: trực tiếp Hashio. */
    expect(hederaTestnet.rpcUrls.default.http[0]).toMatch(/hashio\.io|\/hedera-rpc\/testnet/);
    expect(hederaTestnet.blockExplorers?.default?.name).toBe("HashScan");
    expect(hederaTestnet.blockExplorers?.default?.url).toBe("https://hashscan.io/testnet");
  });

  it("exposes Hedera Mainnet (295)", () => {
    expect(hederaMainnet.id).toBe(295);
    expect(hederaMainnet.blockExplorers?.default?.url).toBe("https://hashscan.io/mainnet");
  });

  it("backward-compat alias polkadotEVMTestnet points at hederaTestnet", () => {
    expect(polkadotEVMTestnet).toBe(hederaTestnet);
  });
});
