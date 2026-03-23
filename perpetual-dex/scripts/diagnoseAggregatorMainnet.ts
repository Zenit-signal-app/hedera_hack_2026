/**
 * Chẩn đoán aggregator trên Hedera mainnet (read-only, không gửi tx).
 *
 * Chạy: npx hardhat run scripts/diagnoseAggregatorMainnet.ts --network hederaMainnet
 *
 * Đọc từ frontend/.env (hardhat.config): địa chỉ contract, token, router; ví chỉ dùng để hiển thị balance + recipient cho staticCall.
 *
 * **Lưu ý:** `UniswapV3SwapRouterAdapter` (id `saucerswap_v2`) cần `adapterData = abi.encode(bytes path)` (token|fee|token…),
 * không phải `abi.encode(address[])` như `UniswapV2LikeAdapter`.
 */
import { ethers } from "hardhat";
import { getAddress, solidityPacked } from "ethers";

/** Entity 0.0.3949424 — khớp `aggregator.ts` / deploy V3 (tránh nhầm `…3c4370`). */
function hederaEntityNumToEvmAddress(num: number): string {
  const hex = BigInt(num).toString(16).padStart(40, "0");
  return `0x${hex}`;
}

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
];
const EXCHANGE_ABI = [
  "function quote((bytes32,address,address,uint256,uint256,address,uint256,bytes)) view returns (uint256)",
  "function adapters(bytes32) view returns (address adapter, bool active)",
];
const QUOTE_AGG_ABI = [
  "function quote((bytes32,address,address,uint256,uint256,address,uint256,bytes)) view returns (uint256)",
  "function exchange() view returns (address)",
];
const ERC20_DECIMALS = ["function decimals() view returns (uint8)"];
/** SaucerSwap QuoterV2 — cùng chữ ký với `UniswapV3SwapRouterAdapter`. */
const QUOTER_V2_QUOTE_ABI = [
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
];

function mustAddr(label: string, v: string | undefined): string | null {
  const t = v?.trim();
  if (!t || !/^0x[a-fA-F0-9]{40}$/.test(t)) {
    console.log(`  [SKIP] ${label}: chưa set hoặc sai định dạng 0x…`);
    return null;
  }
  return t;
}

async function readDecimals(token: string): Promise<number> {
  try {
    const c = new ethers.Contract(token, ERC20_DECIMALS, ethers.provider);
    return Number(await c.decimals.staticCall());
  } catch {
    return 18;
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(signer.address);

  console.log("\n========== Zenit Aggregator — Mainnet diagnostic ==========\n");
  console.log("Chain ID:     ", net.chainId.toString(), "(expected 295)");
  console.log("RPC:          ", process.env.HEDERA_MAINNET_RPC_URL ?? "(default Hashio)");
  console.log("Signer (pub): ", signer.address);
  console.log("HBAR balance: ", ethers.formatEther(bal), "(wei:", bal.toString() + ")");
  if (bal === 0n) {
    console.log("\n⚠ Cần HBAR trên ví deployer để sau này gửi giao dịch deploy/setAdapter/swap.\n");
  }

  const quoteContract = mustAddr("VITE_AGGREGATOR_QUOTE_CONTRACT", process.env.VITE_AGGREGATOR_QUOTE_CONTRACT);
  const exchangeContract = mustAddr("VITE_AGGREGATOR_EXCHANGE_CONTRACT", process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT);
  const usdc = mustAddr("VITE_AGGREGATOR_TOKEN_USDC_MAINNET", process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET);
  const whbar = mustAddr("VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET", process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET);

  /** SaucerSwap V1 RouterV3 — entity 0.0.3045981 */
  const routerAddr =
    process.env.VITE_AGGREGATOR_V2_ROUTER_MAINNET?.trim() ||
    process.env.VITE_SAUCERSWAP_V1_ROUTER_MAINNET?.trim() ||
    "0x00000000000000000000000000000000002e7a5d";
  /** SaucerSwap V1 Factory — entity 0.0.1062784 */
  const factoryAddr =
    process.env.VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET?.trim() ||
    process.env.VITE_HELISWAP_FACTORY_EVM_MAINNET?.trim() ||
    "0x0000000000000000000000000000000000103780";

  async function codeSize(addr: string): Promise<number> {
    const c = await ethers.provider.getCode(addr);
    return c.length > 2 ? (c.length - 2) / 2 : 0;
  }

  console.log("\n--- Contract bytecode ---");
  if (quoteContract) {
    const n = await codeSize(quoteContract);
    console.log("Quote contract / Exchange @ quote:", quoteContract, "→ bytecode bytes:", n || "EMPTY / EOA");
  }
  if (exchangeContract) {
    const n = await codeSize(exchangeContract);
    console.log("Exchange @ swap:              ", exchangeContract, "→ bytecode bytes:", n || "EMPTY / EOA");
  }

  console.log("\n--- SaucerSwap V1 router (getAmountsOut) — cần pool thật giữa các bước path ---");
  console.log("Router:", routerAddr);

  const bridgeRaw = process.env.DIAGNOSE_BRIDGE_TOKEN?.trim();
  const bridge =
    bridgeRaw && /^0x[a-fA-F0-9]{40}$/.test(bridgeRaw) ? (bridgeRaw as string) : null;
  if (bridgeRaw && !bridge) {
    console.log("  ⚠ DIAGNOSE_BRIDGE_TOKEN không đúng 0x40hex — bỏ qua bridge path.");
  }

  let workingPath: string[] | null = null;
  let amountInForQuote: bigint = 0n;

  if (usdc && whbar) {
    const dUsdc = await readDecimals(usdc);
    const dWhbar = await readDecimals(whbar);
    console.log("  On-chain decimals — USDC token:", dUsdc, " WHBAR token:", dWhbar);

    const router = new ethers.Contract(routerAddr, ROUTER_ABI, ethers.provider);
    const amt1 = ethers.parseUnits("1", dUsdc);

    const pathCandidates: string[][] = [[usdc, whbar]];
    if (bridge) {
      pathCandidates.push([usdc, bridge, whbar]);
    }

    for (const path of pathCandidates) {
      if (path.some((x, i) => path.indexOf(x) !== i)) continue;
      try {
        const out = await router.getAmountsOut.staticCall(amt1, path);
        console.log(`  OK getAmountsOut 1 USDC (decimals=${dUsdc}) path=[${path.map((a) => a.slice(0, 8) + "…").join(" → ")}] → out last:`, out[out.length - 1]!.toString());
        workingPath = path;
        amountInForQuote = amt1;
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  FAIL path ${path.length} hop:`, msg.slice(0, 200));
      }
    }

    if (!workingPath) {
      console.log(
        "  ⚠ Không có path router nào chạy được → thường do **sai địa chỉ token mainnet** hoặc **không có pool trực tiếp** (cần thêm token trung gian có pool). Thử set DIAGNOSE_BRIDGE_TOKEN=0x… (token có pool với cả USDC và WHBAR).",
      );
    }
  }

  const adapterLabel = (process.env.ADAPTER_ID?.trim() || "saucerswap").slice(0, 31);
  const isV3ClmmAdapter =
    adapterLabel === "saucerswap_v2" || adapterLabel.toLowerCase().endsWith("_clmm");

  console.log(`\n--- Exchange: adapter đăng ký (bytes32 "${adapterLabel}") ---`);
  const adapterBytes32 = ethers.encodeBytes32String(adapterLabel);
  if (exchangeContract) {
    try {
      const ex = new ethers.Contract(exchangeContract, EXCHANGE_ABI, ethers.provider);
      const [adapter, active] = await ex.adapters.staticCall(adapterBytes32);
      console.log(`  adapters(${adapterLabel}) → adapter:`, adapter, "active:", active);
      if (!active || adapter === ethers.ZeroAddress) {
        console.log(`  ⚠ Chưa có adapter "${adapterLabel}" hoặc chưa active → Exchange.quote sẽ revert AdapterNotActive.`);
        console.log("  (Thử ADAPTER_ID=heliswap nếu bạn chỉ mới đăng ký tên cũ.)");
      }
    } catch (e: unknown) {
      console.log("  FAIL:", e instanceof Error ? e.message : String(e));
    }
  } else {
    console.log("  (bỏ qua — chưa có VITE_AGGREGATOR_EXCHANGE_CONTRACT)");
  }

  console.log("\n--- On-chain quote (QuoteAggregator → Exchange → adapter) ---");
  const quoterV2Addr =
    process.env.VITE_SAUCERSWAP_V2_QUOTER_MAINNET?.trim() || hederaEntityNumToEvmAddress(3949424);

  const quoteTarget = quoteContract;
  if (quoteTarget && usdc && whbar && exchangeContract) {
    try {
      const q = new ethers.Contract(quoteTarget, QUOTE_AGG_ABI, ethers.provider);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
      const dUsdc = await readDecimals(usdc);
      const amtIn = amountInForQuote > 0n ? amountInForQuote : ethers.parseUnits("1", dUsdc);

      let adapterData: string = "0x";
      if (isV3ClmmAdapter) {
        const quoterProbe = new ethers.Contract(quoterV2Addr, QUOTER_V2_QUOTE_ABI, ethers.provider);
        /** Fee tiers thử cho pool CLMM 1 hop (giống `saucerswapV2Quoter.ts` — gồm 1500). */
        const feeTiers = [100, 500, 1500, 3000, 10000] as const;
        const packedDirect = feeTiers.map((fee) =>
          solidityPacked(["address", "uint24", "address"], [getAddress(usdc), BigInt(fee), getAddress(whbar)]),
        );
        let quoted = false;
        for (let i = 0; i < feeTiers.length; i++) {
          const packed = packedDirect[i]!;
          try {
            const qr = await quoterProbe.quoteExactInput.staticCall(packed, amtIn);
            const qOut = qr[0] as bigint;
            if (qOut > 0n) {
              console.log(`  QuoterV2 trực tiếp OK — fee ${feeTiers[i]} 1 hop · amountOut wei: ${qOut.toString()}`);
            }
          } catch (e: unknown) {
            console.log(
              `  QuoterV2 1 hop fee ${feeTiers[i]}:`,
              e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
            );
          }
          adapterData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [packed]);
          try {
            const tuple = [
              adapterBytes32,
              usdc,
              whbar,
              amtIn,
              0n,
              signer.address,
              deadline,
              adapterData,
            ] as const;
            const out = await q.quote.staticCall(tuple);
            console.log(
              `  CLMM adapterData = abi.encode(bytes) — fee ${feeTiers[i]} · 1 hop USDC→WHBAR · path bytes len ${(packed.length - 2) / 2}`,
            );
            console.log("  quote() OK → amountOut wei:", out.toString());
            quoted = true;
            break;
          } catch {
            /* thử fee tiếp */
          }
        }
        if (!quoted && bridge) {
          /** 2 hop: USDC → bridge → WHBAR (một số cặp chỉ có thanh khoản CLMM qua token trung gian). */
          const feeTiers2 = [100, 500, 1500, 3000, 10000] as const;
          console.log(`  Thử CLMM 2 hop qua bridge ${bridge.slice(0, 10)}…`);
          outer: for (const f0 of feeTiers2) {
            for (const f1 of feeTiers2) {
              const packed = solidityPacked(
                ["address", "uint24", "address", "uint24", "address"],
                [getAddress(usdc), BigInt(f0), getAddress(bridge), BigInt(f1), getAddress(whbar)],
              );
              adapterData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [packed]);
              try {
                const tuple = [
                  adapterBytes32,
                  usdc,
                  whbar,
                  amtIn,
                  0n,
                  signer.address,
                  deadline,
                  adapterData,
                ] as const;
                const out = await q.quote.staticCall(tuple);
                console.log(
                  `  CLMM adapterData 2 hop — fees ${f0}/${f1} · path len ${(packed.length - 2) / 2} bytes`,
                );
                console.log("  quote() OK → amountOut wei:", out.toString());
                quoted = true;
                break outer;
              } catch {
                /* tiếp */
              }
            }
          }
        }
        if (!quoted) {
          throw new Error(
            bridge
              ? "quote revert cho 1 hop và 2 hop (bridge trong env) — kiểm tra Quoter/pool trên HashScan hoặc cặp token."
              : "quote revert với mọi fee [100,500,1500,3000,10000] cho 1 hop — thử set DIAGNOSE_BRIDGE_TOKEN=0x… (token có pool V2 USDC và WHBAR) rồi chạy lại.",
          );
        }
      } else if (workingPath && workingPath.length >= 2) {
        adapterData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [workingPath]);
        console.log("  V1 adapter: adapterData = abi.encode(address[]) từ path router đã OK, hops:", workingPath.length - 1);
        const tuple = [
          adapterBytes32,
          usdc,
          whbar,
          amtIn,
          0n,
          signer.address,
          deadline,
          adapterData,
        ] as const;
        const out = await q.quote.staticCall(tuple);
        console.log("  quote() OK → amountOut wei:", out.toString());
      } else {
        console.log("  Thử adapterData=0x — có thể revert nếu không có pool trực tiếp.");
        const tuple = [
          adapterBytes32,
          usdc,
          whbar,
          amtIn,
          0n,
          signer.address,
          deadline,
          adapterData,
        ] as const;
        const out = await q.quote.staticCall(tuple);
        console.log("  quote() OK → amountOut wei:", out.toString());
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("  quote() FAIL:", msg.slice(0, 500));
      if (isV3ClmmAdapter) {
        console.log(
          "  → Adapter V3: cần **packed path** (token|fee|token). Script đã thử fee 100/500/1500/3000/10000. Nếu vẫn fail: thử cặp khác hoặc multi-hop trong app.",
        );
      } else {
        console.log(
          "  → Adapter V1: thường do **không có pool** cho path [USDC,WHBAR], hoặc **sai decimals amountIn**. Dùng router test phía trên + DIAGNOSE_BRIDGE_TOKEN.",
        );
      }
    }
  } else {
    console.log("  (cần đủ QUOTE + EXCHANGE + USDC + WHBAR mainnet trong env để thử staticCall)");
  }

  console.log("\n--- Mirror (factory bytecode — không gọi PairCreated, chỉ kiểm tra contract tồn tại) ---");
  try {
    const fs = await codeSize(factoryAddr);
    console.log("Factory", factoryAddr, "bytecode bytes:", fs || "EMPTY");
  } catch (e: unknown) {
    console.log("  FAIL:", e instanceof Error ? e.message : String(e));
  }

  console.log("\n========== Kết luận triển khai ==========");
  console.log([
    "1. Deploy / cấu hình: Exchange + QuoteAggregator + adapter đúng loại:",
    "   - V1 AMM: UniswapV2LikeAdapter + setAdapter(\"saucerswap\", …) — extraData = abi.encode(address[]).",
    "   - V2 CLMM: UniswapV3SwapRouterAdapter + setAdapter(\"saucerswap_v2\", …) — extraData = abi.encode(bytes packed path). HeliSwap đã đóng — không dùng.",
    "2. Env frontend: VITE_AGGREGATOR_QUOTE_CONTRACT, VITE_AGGREGATOR_EXCHANGE_CONTRACT, token USDC/WHBAR mainnet, decimals đúng khi quote.",
    "3. Mirror graph trong browser: cần pool PairCreated trong cửa sổ 7 ngày; pool cũ → indexer hoặc subgraph.",
    "4. Đủ HBAR cho gas khi swap/approve thật.",
    "5. Chẩn đoán: ADAPTER_ID=saucerswap (V1) hoặc ADAPTER_ID=saucerswap_v2 (CLMM).",
  ].join("\n"));
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
