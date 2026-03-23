# Routing native HTS vs EVM (Zenit Aggregator)

## Câu hỏi

Ứng dụng **SaucerSwap** có “smart router” có thể **tối ưu thêm qua native HTS** (Hedera Token Service) — không chỉ gọi router EVM (`getAmountsOut`, QuoterV2, v.v.).

**Zenit trong repo này hiện chỉ định tuyến và quote trên lớp EVM** (token ERC-20 facade, adapter → SaucerSwap V1 / V2 CLMM).

## Vì sao không “bật thêm một cờ” là xong?

| Lớp | EVM (Zenit hiện tại) | Native HTS (như nhiều flow Hedera “thuần”) |
|-----|----------------------|-------------------------------------------|
| Gọi swap / quote | `eth_call` tới Router/Quoter, ABI Uniswap-style | Thường **SDK Hedera** + giao dịch HTS (`CryptoTransfer`, v.v.) hoặc contract gọi **precompile 0x167** |
| Token | Địa chỉ `0x…` (facade) | `0.0.xxx` entity + associate |
| Smart router độc quyền | Không — dùng pool công khai + math chuẩn | App chính chủ có thể có **đường đi / batch / fee** không công khai |

Logic “smart router HTS” của một bên thứ ba **không có API công khai chuẩn** để Zenit gọi thay thế quote EVM. Muốn **parity thật** cần một trong các hướng dưới.

## Hướng triển khai khả thi (roadmap)

### Giai đoạn A — Đã có trong repo

- Quote **V1 + V2 CLMM**, so sánh output, split quote V1+V2 (thông tin).
- Ghi chú **`htsRoutingNote`** + UI giải thích: EVM-only; HTS là hướng mở rộng.
- Tài liệu này.

### Giai đoạn B — Tích hợp “bên ngoài” (nếu có nguồn)

- Nếu sau này có **HTTP API** (chính thức hoặc self-hosted) trả **best path + minOut** cho cặp HTS/EVM:
  - Thêm `quoteSource: 'external_hts'` (hoặc tương đương) trong `AggregatorQuoteResult`.
  - So sánh với quote EVM và hiển thị “tốt hơn X bps” (read-only) hoặc route thực thi qua bridge contract (phụ thuộc mô hình custody).

### Giai đoạn C — On-chain HTS trong Zenit

- Contract mới dùng **HIP-206 / precompile** (`associate`, `transferTokens`) — mẫu đã có trong repo (`ZUSDCStaking`, `Reward.sol`).
- **Adapter** mới implement `IAdapter` gọi pool/SaucerSwap **qua đường HTS** *chỉ khi* có spec rõ (địa chỉ, encoding, audit) — thường **không** trùng 1:1 với `UniswapV2LikeAdapter`.

### Giai đoạn D — Indexer / đồ thị HTS

- Mirror + subgraph / indexer riêng để **đồ thị thanh khoản** ngoài cặp đã biết — tốn chi phí vận hành, không nằm trong scope frontend thuần.

## Kết luận

- **Có thể mở rộng** theo roadmap trên.
- **Không thể** sao chép nguyên “smart router HTS” của app SaucerSwap mà không có API hoặc không tự xây indexer + adapter.

Xem thêm: [`AGGREGATOR.md`](./AGGREGATOR.md) (thuật toán quote EVM hiện tại).
