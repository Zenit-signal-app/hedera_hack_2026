# Liquidity Aggregator (Hedera) — phương án Zenit

Tài liệu mô tả **cách triển khai trong repo này**: smart contract, frontend `/aggregate`, quote mô phỏng, quote on-chain qua RPC, và roadmap — không phụ thuộc codebase bên ngoài.

## Phương án tổng thể

| Lớp | Nội dung |
|-----|----------|
| **On-chain** | `Exchange`: đăng ký `bytes32 adapterId` → địa chỉ adapter. `swap` chuyển `tokenIn` vào adapter rồi gọi `IAdapter.executeSwap`. `quote` gọi `IAdapter.quote` (view). `QuoteAggregator` bọc `Exchange.quote` cho ABI cố định. |
| **Adapter** | Mỗi venue (SaucerSwap V1, Pangolin, …) là một contract adapter riêng (`contracts/adapters/*`) implement `IAdapter` — routing tới router/pool thật khi đã cấu hình địa chỉ. **HeliSwap đã đóng** — không dùng. |
| **Frontend** | Trang `LiquidityAggregator`: venue → **`resolveOnchainAdapterBytes32`** (khớp V1 vs CLMM với `encodedPath`). **Thứ tự:** quote **router SaucerSwap** (`getAmountsOut` / Quoter — hiển thị trước) → sau đó **`Exchange.quote`** qua `VITE_AGGREGATOR_QUOTE_CONTRACT` **chạy nền** (không chặn spinner chính). **Không** dùng địa chỉ contract adapter làm `bytes32` id — xem **`AGGREGATOR_UI_ENV.md`**. |
| **Stats (tuỳ chọn)** | `VITE_AGGREGATOR_STATS_URL` → JSON → `aggregatorStats.ts` format hiển thị. |
| **Kiểm thử** | `test/Exchange.spec.ts` — `setAdapter`, `swap`, slippage pass/fail. |

### HashPack (WalletConnect) + mainnet

- **`VITE_HEDERA_EVM_NETWORK=mainnet`** trong `frontend/.env` — WalletConnect (`hashgraphWalletConnect`) dùng ledger **mainnet**; đồng thời `resolveEvmAddress` / mirror phải gọi **mainnet mirror** (trước đây gọi nhầm testnet sẽ khiến kết nối mainnet thất bại).
- **`VITE_WALLETCONNECT_PROJECT_ID`** — bắt buộc (cloud.walletconnect.com).
- Trang Aggregate đồng bộ `zenit:wallet:evmAddress` / `accountId` qua sự kiện `zenit-hashgraph-wallet` và hiển thị EVM + badge **HashPack WC** khi ký qua WC.

### HBAR native vs WHBAR (swap)

- **Exchange.swap** chỉ di chuyển **ERC-20** (`transferFrom` trên `tokenIn`).
- **Địa chỉ 0x000…000** trong Advanced (token in/out) được coi **native HBAR** — route/pool vẫn dùng **WHBAR** (SaucerSwap).
- **SaucerSwap V1 (AMM)** — có thể đi **trực tiếp** router (không qua Exchange) với **`msg.value`**:
  - **HBAR → token:** `swapExactETHForTokensSupportingFeeOnTransferTokens` (tên `ETH` giữ theo Uniswap) + **`value` = weibars (18 decimals)**; path bắt đầu bằng WHBAR — [docs](https://docs.saucerswap.finance/v/developer/saucerswap-v1/swap-operations/swap-hbar-for-tokens).
  - **Token → HBAR:** `swapExactTokensForETHSupportingFeeOnTransferTokens` — path kết thúc WHBAR, router unwrap native.
  - Bật/tắt: `VITE_AGGREGATOR_USE_SAUCE_NATIVE_HBAR_SWAP` (mặc định bật; `=0` thì dùng **wrap `deposit()` + approve + Exchange** như cũ).
  - Hàm router: mặc định **`swapExactETHForTokens`**; nếu token HTS cần xử lý phí chuyển, set `VITE_AGGREGATOR_HBAR_TO_TOKEN_SWAP_FN=supporting` (`swapExactETHForTokensSupportingFeeOnTransferTokens`).
  - **Quan trọng (wagmi):** sau `waitForTransactionReceipt` phải kiểm tra `status === 'success'` — nếu không, giao dịch có thể **revert** nhưng ví chỉ **trừ phí**; UI cũ báo nhầm “thành công”.
- Khi **tắt** direct Saucer hoặc quote là **V2 CLMM**, nếu **thiếu WHBAR ERC-20** nhưng còn **HBAR native**, UI gọi **`deposit()`** trên WHBAR để wrap phần thiếu, rồi `approve` + `Exchange.swap`.

## Mục tiêu sản phẩm

- **Multi-hop:** tối ưu đường đi A → … → B trên các pool Hedera (HTS / ERC-20 facade).
- **Slippage:** `amountOutMin`, deadline, hiển thị price impact.
- **Chia lệnh:** TWAP / nhiều chunk để giảm trượt giá trên pool mỏng.
- **Tối ưu giá:** so sánh nhiều venue (DEX) và nhiều path; sau này thêm adapter bridge khi cần.

## Thuật toán tìm đường khi bấm Quote (Zenit)

Khái niệm “**Dijkstra trên đồ thị**” thường dùng khi mỗi cạnh có **trọng số** (phí, thanh khoản). Trong repo này, giai đoạn đầu dùng:

1. **Đồ thị:** Mỗi pool SaucerSwap **V1** (Uniswap V2–style) là một **cạnh** giữa hai token. **HeliSwap đã đóng** — không index router/pool HeliSwap; thanh khoản thực tế cần coi là tập trung qua **SaucerSwap** (đúng factory/router trong env).
2. **Điểm mấu chốt (hub / bridge):** **WHBAR**, **USDC**, và khi có địa chỉ EVM đúng — **USDT** — là các “cầu” thanh khoản lớn; thêm **SAUCE**, **XSAUCE**, facade **HBAR.ℏ** trong whitelist (`saucerPathFinder` + `shared/constants/bridges.ts`).
3. **Liệt kê path:** **BFS** trên đồ thị (từ Mirror `PairCreated`, cửa sổ 7 ngày) + **path tĩnh** từ Path Finder — tối đa **`AGGREGATOR_MAX_HOPS`** (4 cạnh). *Không* dùng Dijkstra có trọng số trên cạnh khi sinh tập path.
4. **So sánh kết quả:** Với mỗi path hợp lệ, gọi **`getAmountsOut`** (V1) và song song **QuoterV2** (CLMM). **Venue đơn:** chọn thực thi **V2 chỉ khi** `amountOut` CLMM **lớn hơn** output V1 tốt nhất (cùng full `amountIn`); nếu không → V1. Thêm **quote split V1+V2** (`venueSplitV1V2`): lưới bps chia `amountIn` giữa path V1 tốt nhất và `pathPacked` CLMM — nếu tổng out > `max(V1,V2)` thì hiển thị (thực thi vẫn 1 tx / 1 venue; chia 2 venue = 2 lệnh). **HTS** (routing native ngoài EVM) chưa có — `htsRoutingNote` trong quote.

### Tốc độ hiển thị route (UI) — mục tiêu **~6s**

- **Partial quote:** sau `getAmountsOut` + Quoter V2 + `rankedRoutes`, UI nhận **`onQuotePartial`** — bảng **Select route** hiện ngay; spinner “Getting quote” tắt. Phần **split** (multi-route V1+V1, hybrid V1+V2) chạy sau (nhiều RPC) — badge nhỏ “Đang tính thêm…”.
- **Ngân sách:** `VITE_AGGREGATOR_QUOTE_BUDGET_MS` (mặc định **6000**). Trước khi hết ngân sách: dừng thêm lô `getAmountsOut` V1, bỏ **split** refinement, hoặc bỏ bridge discovery nếu đã trễ.
- **Mirror:** `VITE_AGGREGATOR_MIRROR_MAX_WAIT_MS` (mặc định **2800**) — nếu Mirror chưa trả trong thời gian này → bỏ đồ thị (vẫn còn path tĩnh + BFS rỗng). `VITE_AGGREGATOR_MIRROR_MAX_PAGES` mặc định **6** (ít trang hơn = nhanh hơn).
- **Quoter V2:** `VITE_AGGREGATOR_V2_QUOTE_MAX_WAIT_MS` (mặc định **3200**) — hết giờ thì chỉ còn quote V1 + thông báo lỗi V2 ngắn.
- **Split:** lưới bps thưa (5 điểm), ít path so khớp multi-route hơn; song song **`readDecimals` cache** + `Promise.all` hop V1.
- **Batch RPC:** `getAmountsOut` theo lô.
5. **UI:** `rankedRoutes` — **sắp xếp theo output**; **`isPrimary`** khớp venue đã chọn (CLMM khi V2 > V1, ngược lại V1).
6. **Ví dụ đường USDC → WHBAR (khái niệm):**
   - **Đường 1:** USDC → WHBAR (trực tiếp, nếu có pool).
   - **Đường 2:** USDC → USDT → WHBAR (cần pool + địa chỉ **USDT** mainnet trong env / docs SaucerSwap).
   - **Đường 3:** USDC → SAUCE → WHBAR (thường được thử qua Path Finder + BFS).
7. **Phí mỗi hop:** Trên AMM kiểu Uniswap V2, mỗi swap ~**0,3%** phí pool (và có thể khác theo pool); route **3-hop** chỉ tốt nếu **amountOut sau cùng** vẫn cao hơn direct đủ để bù thêm phí/trượt — điều này thể hiện trực tiếp khi so **`getAmountsOut`**, không cần cộng thủ công từng 0,3%.
8. **Script diagnose:** `DIAGNOSE_BRIDGE_TOKEN` (trong `scripts/diagnoseAggregatorMainnet.ts`) nhận **một địa chỉ token EVM `0x…`** có pool tốt với cả USDC và WHBAR — không phải “HBAR native” dạng `0.0.x`; trên path router, **HBAR** trong UI thường tương ứng **WHBAR** (wrapped) hoặc facade **HBAR.ℏ** (địa chỉ trong whitelist).

## Trạng thái hiện tại (repo)

| Thành phần | Mô tả |
|------------|--------|
| `frontend/src/config/aggregator.ts` | Chain id (295/296), venue stub, env |
| `frontend/src/lib/aggregatorQuote.ts` | `getAggregatorQuoteUnified` → `v2RouterQuote`: **CLMM (QuoterV2)** khi có pool, else **V1 `getAmountsOut`**, else mock |
| `frontend/src/lib/v2RouterQuote.ts` | Route thật: **Mirror Node** (PairCreated → đồ thị) + path bridge + `getAmountsOut`, chọn **amountOut tối đa** |
| `frontend/src/lib/saucerPathFinder.ts` | **Path Finder:** sinh thêm route tĩnh (SAUCE, XSAUCE, HBAR.ℏ, cặp SAUCE↔XSAUCE, …) tối đa `AGGREGATOR_MAX_HOPS` — dùng chung cho **V1** và **Quoter V2 (CLMM)** để gần với routing SaucerSwap app |
| `frontend/src/lib/mirrorPoolGraph.ts` | `GET .../contracts/{factory}/results/logs` (`topic0` PairCreated), BFS path, cache `sessionStorage` 5 phút |
| `frontend/src/lib/bridgeTokenDiscovery.ts` | **3 bước:** đồ thị pool → giao điện USDC/WHBAR → `getReserves` qua `getPair` |
| `shared/constants/bridges.ts` | Whitelist token mạnh (USDC, WHBAR, SAUCE, …) — scale giai đoạn đầu |
| `scripts/scanBridgeCandidates.ts` | Quét factory SaucerSwap V1, xếp hạng token X cho route 3-hop — `npm run scan:bridges:mainnet` |
| `frontend/src/lib/aggregatorQuoteBridge.ts` | Gọi `quote` on-chain qua `Exchange` hoặc `QuoteAggregator` (JSON-RPC / `eth_call`) |
| `frontend/src/lib/aggregatorStats.ts` | Đọc **stats** từ backend (`VITE_AGGREGATOR_STATS_URL`) — JSON linh hoạt |
| `frontend/src/lib/aggregatorOnchainQuote.ts` | Wrapper `quoteOnchainExpectedOut` (parse amount + Hashio provider) |
| `frontend/src/pages/LiquidityAggregator.tsx` | Trang `/aggregate` — quote + on-chain + **approve + `Exchange.swap`** (cần env Exchange) |
| `frontend/src/styles/zenit-aggregator.css` | Theme Zenit (mint/cream/deck) cho trang aggregator |
| `contracts/Exchange.sol` | Meta-router: `setAdapter`, `swap`, `quote` → adapter |
| `contracts/interface/IAdapter.sol` | `quote` + `executeSwap` (mỗi venue implement) |
| `contracts/adapters/UniswapV2LikeAdapter.sol` | Venue kiểu AMM V2 |
| `contracts/adapters/FixedRateSwapAdapter.sol` | Venue tỷ giá cố định (ví dụ stable/pegged) |
| `contracts/QuoteAggregator.sol` | `quote(params)` → `Exchange.quote` |
| `contracts/mocks/MockV2Router.sol`, `MockERC20.sol` | Test Hardhat |
| `test/Exchange.spec.ts` | `setAdapter` → `swap` → slippage OK / fail |

### Mirror Node & đồ thị pool

1. **Factory** SaucerSwap **V1** mainnet (entity `0.0.1062784` → EVM mặc định trong `aggregator.ts`), ghi đè bằng `VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET` (alias cũ: `VITE_HELISWAP_FACTORY_EVM_MAINNET`).
2. Gọi Mirror **`/api/v1/contracts/{factory}/results/logs`** với `topic0 = keccak256(PairCreated(...))` và **`timestamp` trong ≤ 7 ngày** (giới hạn API).
3. Từ mỗi log: `topics[1]`, `topics[2]` → hai đỉnh token, thêm **cạnh** vào đồ thị vô hướng.
4. **BFS** tìm mọi đường `tokenIn → tokenOut` tối đa `AGGREGATOR_MAX_HOPS` (4).
5. **Gộp** với path bridge tĩnh (WHBAR/USDC) rồi chỉ gọi `getAmountsOut` trên các path đó; giữ route có **output lớn nhất**.

**Hạn chế:** cửa sổ 7 ngày chỉ thấy pool **mới tạo** trong khoảng đó; pool cũ vẫn tồn tại on-chain nhưng có thể không có trong đồ thị → cần **nhiều cửa sổ**, **backend indexer**, hoặc **subgraph** cho production.

### Quy trình lọc 3 bước (Pool Discovery → Bridge → Thanh khoản)

1. **Danh mục pool:** quét sự kiện `PairCreated` từ **SaucerSwap V1 Factory** qua Mirror
   `GET /api/v1/contracts/{factory}/results/logs` + `topic0` + `timestamp` (≤ 7 ngày). Địa chỉ: [SaucerSwap deployments](https://docs.saucerswap.finance/developerx/contract-deployments) — **SaucerSwapV1Factory** `0.0.1062784`. **Không** nhầm với SaucerSwap **V2** factory Uniswap V3 (`0.0.3946833`).
2. **Bridge token (giao điện):** từ các cạnh pool, tập token láng giềng **USDC** và tập láng giềng **WHBAR**; token có trong **cả hai tập** là ứng viên cầu cho route `USDC → X → WHBAR`. Triển khai: `findBridgeTokensByIntersection` trong `bridgeTokenDiscovery.ts`.
3. **Thanh khoản:** với mỗi ứng viên `X`, gọi on-chain `factory.getPair(USDC, X)` và `getPair(WHBAR, X)`, rồi `pair.getReserves()` — chỉ chấp nhận nếu **cả hai reserve đều &gt; 0** (`filterBridgesByLiquidity`). Các path 3 hop đủ điều kiện được thêm vào ứng viên route trong `v2RouterQuote.ts` khi quote **USDC ↔ WHBAR**.

**Mirror base:** `getMirrorRestBase()` — ưu tiên `VITE_HEDERA_MIRROR_REST`, mặc định `mainnet-public.mirrornode.hedera.com`.

### Kiến trúc on-chain (Zenit)

| Thành phần | Vai trò |
|------------|--------|
| `Exchange` | `mapping(bytes32 => adapter)` + `swap` / `quote`; `Pausable`, `ReentrancyGuard`. |
| `IAdapter` | `quote` + `executeSwap` — mỗi DEX / venue một adapter. |
| `QuoteAggregator` | ABI ổn định gọi `Exchange.quote` cho frontend / indexer. |

### Deploy / network (Hedera EVM)

- **Mainnet chain id:** 295 — `npx hardhat run scripts/... --network hederaMainnet`
- **Testnet chain id:** 296 — `hederaTestnet` trong `hardhat.config.ts`
- **RPC:** Hashio mặc định hoặc `HEDERA_MAINNET_RPC_URL` / `HEDERA_TESTNET_RPC_URL`
- **Frontend:**
  - `VITE_AGGREGATOR_QUOTE_CONTRACT` = `Exchange` **hoặc** `QuoteAggregator` (chỉ `quote`)
  - `VITE_AGGREGATOR_EXCHANGE_CONTRACT` = **`Exchange`** (bắt buộc để nút **Swap on-chain** gọi `swap` + ERC-20 `approve`)
- **Adapter:** Phải có ít nhất một adapter đã `setAdapter` trên `Exchange` — nếu không, `quote`/`swap` revert `AdapterNotActive`. Deploy `FixedRateSwapAdapter` / `UniswapV2LikeAdapter` và gọi `setAdapter` (xem `scripts/deployExchangeStack.ts`).

Chi tiết deploy (private key mainnet, lệnh npm): **`DEPLOY_AGGREGATOR.md`**.  
Khi `quote` revert / `data=0x`: **`DEBUG_QUOTE_REVERT.md`**.  
**SaucerSwap V2 (CLMM) — QuoterV2, path packed, fee tier, khác V1:** **`SAUCERSWAP_V2_CLMM_QUOTE.md`**.  
**Swap revert sau khi quote / script probe WHBAR→USDC:** **`SWAP_TROUBLESHOOTING.md`**.

## Phases

1. **P0:** trang + config + quote mock.
2. **P1:** đọc reserve / pool từ RPC hoặc subgraph cho 1–2 DEX testnet.
3. **P2:** router graph (2–4 hop), so sánh path.
4. **P3:** audit + mainnet.
5. **P4:** split order / scheduler; bridge adapters.
6. **P5 (tuỳ chọn):** routing **native HTS** (ngoài EVM) — không có trong bản hiện tại; xem **[AGGREGATOR_HTS.md](./AGGREGATOR_HTS.md)** (roadmap, giới hạn, so sánh với app SaucerSwap).

## Rủi ro

- Pool/bridge chưa audit → chỉ dùng số tiền nhỏ khi test.
- Quote mock **không** phản ánh giá thật — không dùng cho production swap nếu chưa nối contract thật.
