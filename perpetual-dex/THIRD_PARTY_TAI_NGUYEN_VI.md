# Tài nguyên bên thứ ba (Third-party resources)

Tài liệu này liệt kê các tài nguyên/bộ thư viện/dịch vụ bên ngoài mà **Zenit Perpetual DEX** (mục tiêu triển khai **Hedera Testnet**, EVM `chainId` 296) sử dụng. Đây là những phần khó hoặc không nên tự viết lại từ đầu (ví dụ: kết nối ví HashPack/WalletConnect, gửi giao dịch Hedera, ORM/migration, thư viện charting, oracle/data feeds).

## 1. RPC Endpoint (dịch vụ blockchain)
- `frontend/.env`: `VITE_RPC_URL`
- `keeper/.env`: `RPC_URL`

Mục đích: cung cấp kênh truy cập JSON-RPC để đọc trạng thái và gửi transaction tới **Hedera Testnet** (ví dụ endpoint Hashio `https://testnet.hashio.io/api`).

## 2. Thư viện charting TradingView (Advanced Charts + Datafeed UDF)
- Nằm trong thư mục `frontend/public/charting_library/`
- Adapter UDF datafeed nằm trong `frontend/public/datafeeds/udf/`

Mục đích: hiển thị biểu đồ nến/volume và tích hợp cơ chế “datafeed” chuẩn để kéo dữ liệu thị trường vào chart.

Ghi chú: phần charting/datafeed này là mã được cung cấp sẵn theo hệ sinh thái TradingView UDF/Datafeed API; dự án chỉ tích hợp và cung cấp adapter cho server/phía dữ liệu của chúng ta.

## 3. Price feeds / Oracle data bên ngoài (ngoài chain)
### 3.1. Pyth Hermes API
- Mặc định trong `keeper/.env`: `PYTH_ENDPOINT=https://hermes.pyth.network`

Mục đích: lấy giá thị trường từ Pyth (fetch HTTP tại `keeper/src/price.ts`).

### 3.2. DIA Data API (fallback)
- Endpoint sử dụng trực tiếp trong code: `https://api.diadata.org/...` (xem `keeper/src/price.ts`)

Mục đích: fallback lấy giá khi Pyth thất bại (ví dụ các cặp **BTCUSD**, **ETHUSD**, **HBARUSD** tùy cấu hình trong keeper).

## 4. On-chain price aggregators (Chainlink-style)
- Keeper có thể đọc từ các contract aggregator “kiểu Chainlink” (địa chỉ feed nằm trong code mặc định hoặc qua env tùy từng cặp).

Mục đích: fallback lấy giá bằng cách gọi `latestRoundData()`/`decimals()` trên các contract aggregator.

## 5. Thư viện npm chính
### 5.1. Frontend (React/Vite)
Dự án dùng các thư viện để tránh tự triển khai các phần phức tạp như UI state, wallet integration, gửi transaction/estimate gas, và chart rendering:
- `react`, `react-dom` (UI)
- `react-router-dom` (routing)
- `wagmi`, `viem`, `ethers` (đọc contract / một số luồng)
- `@hashgraph/hedera-wallet-connect`, `@hiero-ledger/sdk` (HashPack + giao dịch Hedera native)
- `@rainbow-me/rainbowkit` (có thể dùng cho luồng EVM bổ sung)
- `@tanstack/react-query` (fetch/cache cho dữ liệu)
- `tailwindcss` + `postcss` + `autoprefixer` (CSS build)
- `lightweight-charts`, `d3` (chart/visual helpers)
- `decimal.js` (giảm sai số khi thao tác số thập phân trong UI)
- `react-globe.gl` (visual globe)
- `vite` (build/dev server)

### 5.2. Keeper (Node.js service)
Keeper dùng các thư viện để quản lý HTTP server, database, và transaction signing/interaction:
- `fastify` + `@fastify/cors` (REST API)
- `dotenv` (load env)
- `prisma`, `@prisma/client` (ORM + schema/migration SQLite)
- `ethers`, `viem` (contract calls, đọc/ghi dữ liệu, và xử lý transaction)
- `tsx`, `typescript` (tooling)

## 6. Smart contract / ABI
- ABI của smart contract và logic gọi contract là phần bắt buộc phải dựa vào code on-chain của DEX/Oracle.
- Dự án không “tự code lại” các smart contract đó trong file này; nó chỉ dùng ABI để tương tác.

## 7. Tuân thủ license
- Các package nêu trên thường đi kèm license riêng. Kiểm tra license trong `node_modules/` (hoặc tài liệu đi kèm trong `frontend/public/charting_library/`, `frontend/public/datafeeds/udf/`).
- Khi phân phối/build sản phẩm, hãy đảm bảo không xóa thông tin license/notice theo yêu cầu của từng thư viện.

