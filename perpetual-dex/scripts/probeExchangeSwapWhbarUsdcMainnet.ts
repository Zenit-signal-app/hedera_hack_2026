/**
 * Chẩn đoán swap 10 WHBAR (HBAR trên UI) → USDC qua Exchange + adapter (giống trang Aggregate).
 *
 * Đọc `frontend/.env` qua hardhat.config (PRIVATE_KEY / HEDERA_MAINNET_PRIVATE_KEY + VITE_*).
 *
 * Chạy (read-only, không gửi tx):
 *   npm run probe:swap:whbar-usdc:mainnet
 *
 * Thử gửi swap thật (approve + swap) — chỉ khi bạn hiểu rủi ro:
 *   PROBE_SWAP_EXECUTE=1 npm run probe:swap:whbar-usdc:mainnet
 *
 * Nếu ví có **HBAR native** nhưng chưa có WHBAR (ERC-20), giống trang Aggregate — wrap trước rồi swap:
 *   PROBE_SWAP_EXECUTE=1 PROBE_WRAP_NATIVE=1 npm run probe:swap:whbar-usdc:mainnet
 *
 * Gas `deposit()` trên Hedera đôi khi > 2.5M — override:
 *   PROBE_DEPOSIT_GAS_LIMIT=8000000
 *
 * Tuỳ chọn:
 *   PROBE_AMOUNT_HUMAN=10
 *   SLIPPAGE_BPS=100
 *   DIAGNOSE_BRIDGE_TOKEN=0x...   (token trung gian nếu không có pool WHBAR↔USDC trực tiếp)
 */
import { ethers } from "hardhat";
import { getAddress, solidityPacked, AbiCoder, Interface } from "ethers";

const ROUTER_V1_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
];
const EXCHANGE_ABI = [
  "function quote((bytes32,address,address,uint256,uint256,address,uint256,bytes)) view returns (uint256)",
  "function swap((bytes32,address,address,uint256,uint256,address,uint256,bytes)) returns (uint256)",
  "function adapters(bytes32) view returns (address adapter, bool active)",
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
/** WHBAR: `deposit()` nhận native HBAR qua msg.value (weibars 18 dec); mint ERC-20 (tinybars 8 dec). */
const WHBAR_DEPOSIT_ABI = ["function deposit() payable"] as const;

/** Khớp `frontend/src/lib/aggregatorWhbarWrap.ts` */
const WEIBARS_PER_TINYBAR = 10n ** 10n;
function whbarTinybarsToDepositWeibar(tinybars: bigint): bigint {
  return tinybars * WEIBARS_PER_TINYBAR;
}

/** Địa chỉ EVM long-zero WHBAR → token id HTS `0.0.N` (vd. `…163b5a` → `0.0.1456986`). */
function whbarEvmToHtsTokenId(addr: string): string {
  return `0.0.${BigInt(getAddress(addr)).toString()}`;
}

type MirrorAccountTokensJson = {
  account?: string;
  deleted?: boolean;
  /** Giây (chuỗi "seconds.nanoseconds") — nếu < now, tài khoản có thể cần gia hạn. */
  expiry_timestamp?: string;
  balance?: { tokens?: Array<{ token_id?: string }> };
};

function mirrorParseExpirySec(raw: string | undefined): number | null {
  if (!raw) return null;
  const head = raw.split(".")[0]?.trim();
  if (!head) return null;
  const n = Number(head);
  return Number.isFinite(n) ? n : null;
}

type MirrorAccountTokensListJson = {
  tokens?: Array<{ token_id?: string }>;
};

/** Đọc Mirror REST: Hedera account theo EVM + token đã associate (balance.tokens + `/accounts/…/tokens`). */
async function mirrorMainnetAccountTokens(evmAddress: string): Promise<{
  account: string;
  tokenIds: string[];
  expirySec: number | null;
  deleted: boolean;
} | null> {
  const base =
    process.env.HEDERA_MAINNET_MIRROR_URL?.trim() || "https://mainnet-public.mirrornode.hedera.com";
  const id = getAddress(evmAddress);
  try {
    const r = await fetch(`${base}/api/v1/accounts/${id}`);
    if (!r.ok) return null;
    const j = (await r.json()) as MirrorAccountTokensJson;
    if (!j.account) return null;
    const expirySec = mirrorParseExpirySec(j.expiry_timestamp);
    const fromBalance = (j.balance?.tokens ?? []).map((t) => (t.token_id ?? "").trim()).filter(Boolean);
    const set = new Set(fromBalance);
    const r2 = await fetch(`${base}/api/v1/accounts/${id}/tokens?limit=100`);
    if (r2.ok) {
      const j2 = (await r2.json()) as MirrorAccountTokensListJson;
      for (const t of j2.tokens ?? []) {
        const tid = (t.token_id ?? "").trim();
        if (tid) set.add(tid);
      }
    }
    return {
      account: j.account,
      tokenIds: [...set],
      expirySec,
      deleted: Boolean(j.deleted),
    };
  } catch {
    return null;
  }
}

/** Sau khi tx EVM revert, Mirror thường có `error_message` (vd. ILLEGAL_STATE_CHANGE) + gas_used/limit. */
async function mirrorMainnetContractResultHint(txHash: string): Promise<string | null> {
  const base =
    process.env.HEDERA_MAINNET_MIRROR_URL?.trim() || "https://mainnet-public.mirrornode.hedera.com";
  try {
    const r = await fetch(`${base}/api/v1/contracts/results/${txHash}`);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      error_message?: string;
      result?: string;
      gas_used?: number;
      gas_limit?: number;
    };
    const parts = [
      j.error_message,
      j.result,
      j.gas_used != null && j.gas_limit != null ? `gas_used/gas_limit=${j.gas_used}/${j.gas_limit}` : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" | ") : null;
  } catch {
    return null;
  }
}

const QUOTER_V2_ABI = [
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
];

const FEE_TIERS = [100, 500, 1500, 3000, 10000] as const;

/** Entity 0.0.3949424 — khớp `registerV3SwapRouterAdapter` / `aggregator.ts` (không dùng nhầm `0x…3c4370`). */
function hederaEntityNumToEvmAddress(num: number): string {
  const hex = BigInt(num).toString(16).padStart(40, "0");
  return `0x${hex}`;
}

const ADAPTER_V3_ABI = [
  "function quoter() view returns (address)",
  "function quote((address,address,address,address,uint256,uint256,uint256,bytes)) view returns (uint256)",
] as const;

function mustAddr(label: string, v: string | undefined): string {
  const t = v?.trim();
  if (!t || !/^0x[a-fA-F0-9]{40}$/.test(t)) {
    throw new Error(`${label} missing or invalid (expect 0x + 40 hex). Set in frontend/.env (e.g. VITE_AGGREGATOR_*).`);
  }
  return t;
}

function v1AdapterLabel(): string {
  const raw = process.env.VITE_AGGREGATOR_V1_ADAPTER_ID?.trim();
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return "saucerswap";
  return raw && raw.length > 0 ? raw.slice(0, 31) : "saucerswap";
}

async function readDecimals(token: string): Promise<number> {
  const c = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  try {
    return Number(await c.decimals.staticCall());
  } catch {
    return 18;
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 295n) {
    console.warn("Warning: expected chainId 295 (Hedera mainnet). Got:", net.chainId.toString());
  }

  const exchangeAddr = mustAddr(
    "VITE_AGGREGATOR_EXCHANGE_CONTRACT",
    process.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT,
  );
  const whbar = mustAddr(
    "VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET",
    process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET,
  );
  const usdc = mustAddr(
    "VITE_AGGREGATOR_TOKEN_USDC_MAINNET",
    process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET,
  );

  const routerAddr =
    process.env.VITE_AGGREGATOR_V2_ROUTER_MAINNET?.trim() ||
    process.env.VITE_SAUCERSWAP_V1_ROUTER_MAINNET?.trim() ||
    "0x00000000000000000000000000000000002e7a5d";

  const bridgeRaw = process.env.DIAGNOSE_BRIDGE_TOKEN?.trim();
  const bridge =
    bridgeRaw && /^0x[a-fA-F0-9]{40}$/.test(bridgeRaw) ? getAddress(bridgeRaw) : null;

  const amountHuman = process.env.PROBE_AMOUNT_HUMAN?.trim() || "10";
  const slippageBps = Math.min(5000, Math.max(1, Number(process.env.SLIPPAGE_BPS ?? "100") || 100));

  const dWhbar = await readDecimals(whbar);
  const dUsdc = await readDecimals(usdc);
  const amountInWei = ethers.parseUnits(amountHuman, dWhbar);

  console.log("\n========== Probe: WHBAR → USDC via Zenit Exchange (mainnet) ==========\n");
  console.log("Signer:     ", signer.address);
  console.log("Exchange:   ", exchangeAddr);
  console.log("WHBAR:      ", whbar, `(decimals=${dWhbar})`);
  console.log("USDC:       ", usdc, `(decimals=${dUsdc})`);
  console.log("V1 Router:  ", routerAddr);
  console.log("Amount in:  ", amountHuman, "WHBAR →", amountInWei.toString(), "wei");
  console.log("Slippage:   ", slippageBps, "bps");

  const exchange = new ethers.Contract(exchangeAddr, EXCHANGE_ABI, ethers.provider);
  const router = new ethers.Contract(routerAddr, ROUTER_V1_ABI, ethers.provider);

  const labelV1 = v1AdapterLabel();
  const idSaucerswap = ethers.encodeBytes32String(labelV1.slice(0, 31));
  const idV2 = ethers.encodeBytes32String("saucerswap_v2");

  let adapterV2Addr = ethers.ZeroAddress;
  try {
    const [a] = await exchange.adapters.staticCall(idV2);
    if (a && a !== ethers.ZeroAddress) adapterV2Addr = a;
  } catch {
    /* ignore */
  }

  /** Ưu tiên env → `quoter()` trên adapter deploy → entity 3949424 (không dùng nhầm địa chỉ cũ `…3c4370`). */
  let quoterV2Addr = process.env.VITE_SAUCERSWAP_V2_QUOTER_MAINNET?.trim();
  if (!quoterV2Addr || !/^0x[a-fA-F0-9]{40}$/.test(quoterV2Addr)) {
    if (adapterV2Addr !== ethers.ZeroAddress) {
      try {
        const ac = new ethers.Contract(adapterV2Addr, ADAPTER_V3_ABI, ethers.provider);
        const q = (await ac.quoter.staticCall()) as string;
        if (q && q !== ethers.ZeroAddress) quoterV2Addr = q;
      } catch {
        /* ignore */
      }
    }
    if (!quoterV2Addr || !/^0x[a-fA-F0-9]{40}$/.test(quoterV2Addr)) {
      quoterV2Addr = hederaEntityNumToEvmAddress(3949424);
    }
  }

  console.log("Quoter V2 RPC: ", quoterV2Addr);
  if (adapterV2Addr !== ethers.ZeroAddress) {
    console.log("Adapter V2:   ", adapterV2Addr, "(on-chain quoter() should match RPC unless env override)");
  }

  const quoterV2 = new ethers.Contract(quoterV2Addr, QUOTER_V2_ABI, ethers.provider);

  console.log("\n--- Exchange adapters ---");
  for (const [name, id] of [
    [labelV1, idSaucerswap],
    ["saucerswap_v2", idV2],
  ] as const) {
    try {
      const [ad, active] = await exchange.adapters.staticCall(id);
      console.log(`  adapters("${name}") →`, ad, "active:", active);
    } catch (e) {
      console.log(`  adapters("${name}") FAIL:`, e instanceof Error ? e.message : e);
    }
  }

  /** Path candidates WHBAR → USDC */
  const pathCandidates: string[][] = [[whbar, usdc]];
  if (bridge) {
    pathCandidates.push([whbar, bridge, usdc]);
  }

  let bestV1Path: string[] | null = null;
  let bestV1Out = 0n;
  for (const path of pathCandidates) {
    if (path.some((x, i) => path.indexOf(x) !== i)) continue;
    try {
      const amts = await router.getAmountsOut.staticCall(amountInWei, path);
      const out = amts[amts.length - 1] as bigint;
      if (out > bestV1Out) {
        bestV1Out = out;
        bestV1Path = path;
      }
      console.log(
        `  V1 getAmountsOut OK path=[${path.map((a) => a.slice(0, 8) + "…").join(" → ")}] → out ${out.toString()} (USDC wei)`,
      );
    } catch (e) {
      console.log(
        `  V1 FAIL path len ${path.length}:`,
        e instanceof Error ? e.message.slice(0, 160) : e,
      );
    }
  }

  let bestV2Out = 0n;
  let bestPacked: string | null = null;
  for (const fee of FEE_TIERS) {
    const packed = solidityPacked(
      ["address", "uint24", "address"],
      [getAddress(whbar), BigInt(fee), getAddress(usdc)],
    );
    try {
      const qr = await quoterV2.quoteExactInput.staticCall(packed, amountInWei);
      const out = qr[0] as bigint;
      if (out > bestV2Out) {
        bestV2Out = out;
        bestPacked = packed;
      }
      if (out > 0n) {
        console.log(`  V2 Quoter direct fee=${fee} → out ${out.toString()} (USDC wei)`);
      }
    } catch {
      /* try next fee */
    }
  }

  if (bridge && bestV2Out === 0n) {
    console.log("\n  Thử CLMM 2-hop qua bridge…");
    for (const f0 of FEE_TIERS) {
      for (const f1 of FEE_TIERS) {
        const packed = solidityPacked(
          ["address", "uint24", "address", "uint24", "address"],
          [getAddress(whbar), BigInt(f0), getAddress(bridge), BigInt(f1), getAddress(usdc)],
        );
        try {
          const qr = await quoterV2.quoteExactInput.staticCall(packed, amountInWei);
          const out = qr[0] as bigint;
          if (out > bestV2Out) {
            bestV2Out = out;
            bestPacked = packed;
          }
          if (out > 0n) {
            console.log(`  V2 2-hop fees ${f0}/${f1} → out ${out.toString()}`);
            break;
          }
        } catch {
          /* */
        }
      }
    }
  }

  /** Giống `v2RouterQuote`: CLMM chỉ khi V2 > V1 (cùng amountIn); nếu không có path V1 thì dùng V2 nếu có. */
  const useClmm =
    Boolean(bestPacked) &&
    bestV2Out > 0n &&
    (bestV1Path == null || bestV2Out > bestV1Out);

  if (!bestV1Path && !bestPacked) {
    console.log("\n❌ Không quote được V1 hay V2 — kiểm tra địa chỉ token / pool (bridge trong DIAGNOSE_BRIDGE_TOKEN).");
    process.exit(1);
  }

  let adapterId: string;
  let adapterData: string;

  if (useClmm && bestPacked) {
    adapterId = idV2;
    adapterData = AbiCoder.defaultAbiCoder().encode(["bytes"], [bestPacked]);
    console.log("\n→ Chọn thực thi: **SaucerSwap V2 (CLMM)** (output V2 > V1 hoặc V1 không có path).");
  } else if (bestV1Path) {
    adapterId = idSaucerswap;
    adapterData = AbiCoder.defaultAbiCoder().encode(["address[]"], [bestV1Path]);
    console.log("\n→ Chọn thực thi: **SaucerSwap V1 (AMM)** (getAmountsOut).");
  } else {
    console.log("\n❌ Không xác định được adapterData.");
    process.exit(1);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const routerOut = bestV1Path ? bestV1Out : 0n;
  const v2Out = bestPacked ? bestV2Out : 0n;
  const expectedForVenue = adapterId === idV2 ? bestV2Out : bestV1Out;
  const minOut = (expectedForVenue * BigInt(10000 - slippageBps)) / 10000n;

  console.log("\n--- So sánh output (wei USDC) ---");
  console.log("  V1 best out: ", routerOut.toString());
  console.log("  V2 best out: ", v2Out.toString());
  console.log("  Dùng venue out (adapter):", expectedForVenue.toString());
  console.log("  minOut (slippage):       ", minOut.toString());

  const params = {
    adapterId,
    tokenIn: whbar,
    tokenOut: usdc,
    amountIn: amountInWei,
    minAmountOut: minOut,
    recipient: signer.address,
    deadline,
    adapterData,
  };

  const tuple = [
    params.adapterId,
    params.tokenIn,
    params.tokenOut,
    params.amountIn,
    params.minAmountOut,
    params.recipient,
    params.deadline,
    params.adapterData,
  ] as const;

  console.log("\n--- Exchange.quote (static) ---");
  try {
    const qOut = await exchange.quote.staticCall(tuple);
    console.log("  quote() →", qOut.toString(), "(wei USDC)");
    if (qOut < minOut) {
      console.log("  ⚠ quote < minOut — sẽ revert SwapTooSmall tại swap (điều chỉnh slippage hoặc amount).");
    }
  } catch (e) {
    console.log("  quote() REVERT:", e instanceof Error ? e.message : e);
    console.log(
      "  → Thường gặp: AdapterNotActive, InvalidPath, QuoterCallFailed (QuoterV2 qua staticcall lồng trên Hedera đôi khi khác gọi Quoter trực tiếp — xem bước adapter.quote bên dưới).",
    );
  }

  if (adapterId === idV2 && adapterV2Addr !== ethers.ZeroAddress) {
    console.log("\n--- UniswapV3SwapRouterAdapter.quote (gọi trực tiếp) ---");
    const reqTuple = [
      signer.address,
      signer.address,
      whbar,
      usdc,
      amountInWei,
      0n,
      deadline,
      params.adapterData,
    ] as const;
    try {
      const adQ = new ethers.Contract(adapterV2Addr, ADAPTER_V3_ABI, ethers.provider);
      const o = await adQ.quote.staticCall(reqTuple);
      console.log("  adapter.quote OK →", o.toString(), "(wei USDC)");
    } catch (e) {
      console.log("  adapter.quote REVERT:", e instanceof Error ? e.message.slice(0, 360) : e);
      console.log(
        "  → Nếu Quoter RPC (phía trên) OK: có thể do gọi Quoter lồng trong contract view trên Hedera. Swap thật **không** gọi Quoter — chỉ `SwapRouter.exactInput`; chỉ cần đủ WHBAR + approve + associate USDC.",
      );
    }
  }

  const whbarC = new ethers.Contract(whbar, ERC20_ABI, signer);
  const bal = await whbarC.balanceOf.staticCall(signer.address);
  const alw = await whbarC.allowance.staticCall(signer.address, exchangeAddr);
  console.log("\n--- Signer WHBAR ---");
  console.log("  balance:  ", bal.toString(), `(>= amount? ${bal >= amountInWei})`);
  console.log("  allowance:", alw.toString(), `(>= amount? ${alw >= amountInWei})`);

  console.log("\n--- Exchange.swap (staticCall — mô phỏng msg.sender = signer) ---");
  const exS = exchange.connect(signer) as typeof exchange;
  try {
    await exS.swap.staticCall(tuple);
    console.log("  staticCall swap OK — giao dịch thật có khả năng thành công (nếu không vướng HTS associate).");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("  staticCall swap REVERT:", msg.slice(0, 400));
    if (/insufficient|transfer|STF|ERC20/i.test(msg)) {
      console.log(
        "  → Gợi ý: USDC chưa **associate** trên tài khoản Hedera / token không nhận được — thử associate USDC trong HashPack.",
      );
    }
    if (/SwapTooSmall|amountOut/i.test(msg)) {
      console.log("  → Tăng slippage hoặc dùng minOut = min(router, Exchange.quote) như `minOutSafe` phía trên.");
    }
    if (/SPENDER_DOES_NOT_HAVE_ALLOWANCE|ALLOWANCE/i.test(msg)) {
      console.log(
        "  → Bình thường khi balance WHBAR=0 hoặc chưa approve Exchange: staticCall vẫn mô phỏng transferFrom. Nạp WHBAR (ERC-20) + approve rồi swap thật.",
      );
    }
  }

  const execute = process.env.PROBE_SWAP_EXECUTE === "1" || process.env.PROBE_SWAP_EXECUTE === "true";
  if (!execute) {
    console.log("\n(Không gửi tx — đặt PROBE_SWAP_EXECUTE=1 để approve + swap thật.");
    console.log(
      "Thiếu WHBAR nhưng có HBAR native: thêm PROBE_WRAP_NATIVE=1 để gọi deposit() trước (giống UI Aggregate).\n",
    );
    return;
  }

  let balExec = bal;
  const wrapNative =
    process.env.PROBE_WRAP_NATIVE === "1" || process.env.PROBE_WRAP_NATIVE === "true";

  if (balExec < amountInWei) {
    if (!wrapNative) {
      throw new Error(
        "Insufficient WHBAR (ERC-20) for execute. Nạp WHBAR hoặc dùng HBAR native + PROBE_WRAP_NATIVE=1 (wrap qua deposit()).",
      );
    }
    const deficit = amountInWei - balExec;
    const weibarCost = whbarTinybarsToDepositWeibar(deficit);
    const nativeBal = await ethers.provider.getBalance(signer.address);
    /** Dự phòng phí (ước lượng thô; Hedera EVM trả gas bằng HBAR native). */
    const gasBuffer = 200n * 10n ** 15n;
    console.log("\n--- EXECUTE: wrap native HBAR → WHBAR (deposit) ---");
    console.log("  deficit (tinybars):", deficit.toString());
    console.log("  msg.value (weibars): ", weibarCost.toString());
    console.log("  native HBAR balance:", nativeBal.toString());
    if (nativeBal < weibarCost + gasBuffer) {
      throw new Error(
        `Insufficient native HBAR for wrap + gas buffer. Need at least ~${weibarCost + gasBuffer} wei.`,
      );
    }
    const htsWhbar = whbarEvmToHtsTokenId(whbar);
    const depositData = new Interface([...WHBAR_DEPOSIT_ABI]).encodeFunctionData("deposit", []);
    const depositGas = BigInt(
      Math.min(30_000_000, Math.max(2_500_000, Number(process.env.PROBE_DEPOSIT_GAS_LIMIT ?? "8000000") || 8_000_000)),
    );
    console.log("  WHBAR HTS token id (associate trong HashPack nếu chưa):", htsWhbar);
    console.log("  deposit calldata:", depositData);
    console.log("  deposit gasLimit:", depositGas.toString(), "(PROBE_DEPOSIT_GAS_LIMIT)");
    let txw: Awaited<ReturnType<(typeof signer)["sendTransaction"]>> | undefined;
    try {
      txw = await signer.sendTransaction({
        to: whbar,
        data: depositData,
        value: weibarCost,
        gasLimit: depositGas,
      });
      console.log("  deposit tx:", txw.hash);
      await txw.wait();
    } catch (e) {
      if (txw?.hash) {
        const hint = await mirrorMainnetContractResultHint(txw.hash);
        if (hint) console.log("  Mirror /contracts/results:", hint);
      }
      const msg = e instanceof Error ? e.message : String(e);
      const mirror = await mirrorMainnetAccountTokens(signer.address);
      const nowSec = Math.floor(Date.now() / 1000);
      if (mirror) {
        const hasWhbar = mirror.tokenIds.includes(htsWhbar);
        const expired = mirror.expirySec != null && nowSec > mirror.expirySec;
        console.log("\n  --- Mirror chẩn đoán (mainnet) ---");
        console.log("  Hedera account:", mirror.account);
        if (mirror.expirySec != null) {
          console.log(
            "  expiry_timestamp (UTC ~):",
            new Date(mirror.expirySec * 1000).toISOString(),
            expired ? "→ ĐÃ QUA (cần gia hạn tài khoản)" : "→ còn hạn",
          );
        }
        console.log("  WHBAR HTS id:  ", htsWhbar, "→ trong balance.tokens:", hasWhbar ? "có" : "KHÔNG");
        if (expired) {
          console.log(
            "  → Tài khoản Hedera có thể đã **hết hạn** — mint WHBAR (HTS) qua EVM hay báo ILLEGAL_STATE_CHANGE / LOCAL_CALL_MODIFICATION_EXCEPTION.",
            "Gia hạn (renew) trên HashPack hoặc https://portal.hedera.com rồi chạy lại.",
          );
        } else if (!hasWhbar) {
          console.log(
            "  → deposit() mint WHBAR thường revert nếu chưa associate. HashPack: Associate token",
            htsWhbar,
            "rồi chạy lại probe.",
          );
        } else {
          console.log(
            "  → Đã associate WHBAR; nếu gas_used = gas_limit (vd. 12M/12M) thường là **revert sớm** (không phải “cần thêm gas vô hạn”).",
            "Xem expiry ở trên, HashScan, hoặc wrap WHBAR bằng HashPack / SaucerSwap thay vì RPC script.",
          );
        }
      } else {
        console.log("\n  (Không đọc được Mirror REST — tự kiểm tra associate WHBAR", htsWhbar, "trên HashPack.)");
      }
      throw new Error(
        [
          "WHBAR deposit() revert.",
          mirror?.expirySec != null && nowSec > mirror.expirySec
            ? `Ưu tiên: gia hạn Hedera account ${mirror?.account} (expiry đã qua) — sau đó thử lại deposit.`
            : `Kiểm tra: associate ${htsWhbar}; gia hạn tài khoản nếu expiry quá hạn; hoặc wrap qua ví (HashPack). EVM ${signer.address}.`,
          `Gốc (rút gọn): ${msg.slice(0, 400)}`,
        ].join(" "),
      );
    }
    balExec = await whbarC.balanceOf.staticCall(signer.address);
    console.log("  WHBAR balance after wrap:", balExec.toString());
  }

  if (balExec < amountInWei) {
    throw new Error("Insufficient WHBAR balance for execute (after optional wrap).");
  }
  console.log("\n--- EXECUTE: approve + swap ---");
  const alwExec = await whbarC.allowance.staticCall(signer.address, exchangeAddr);
  if (alwExec < amountInWei) {
    const tx1 = await whbarC.approve(exchangeAddr, amountInWei);
    console.log("  approve tx:", tx1.hash);
    await tx1.wait();
  }
  const tx2 = await exS.swap(tuple, { gasLimit: adapterId === idV2 ? 12_000_000n : 8_000_000n });
  console.log("  swap tx:", tx2.hash);
  const rc = await tx2.wait();
  console.log("  status:", rc?.status);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
