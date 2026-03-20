# Perp DEX — Hedera

Monorepo cho **Zenit Perpetual DEX** chạy trên **Hedera Testnet** (EVM `chainId` 296): smart contracts (Hardhat), giao diện React/Vite, và **keeper** (Node.js) phục vụ TP/SL/Liquidation, oracle, faucet zUSDC (HTS) và đồng bộ nạp tiền.

## Cấu trúc thư mục

| Thư mục | Mô tả |
|--------|--------|
| `perpetual-dex/` | Mã nguồn chính: contracts, `frontend/`, `keeper/` |
| `perpetual-dex/README.md` | Tổng quan kỹ thuật chi tiết (tiếng Anh) |
| `perpetual-dex/command.md` | Lệnh chạy nhanh dev (frontend + keeper) |
| `perpetual-dex/Deployment_Guide.md` | Hướng dẫn triển khai / env |

## Chạy nhanh (development)

1. **Keeper** (bắt buộc cho faucet, TP/SL, `GET /orders`, v.v.) — mặc định cổng **3100**:

   ```bash
   cd perpetual-dex/keeper && npm install && npx prisma generate && npm run dev
   ```

2. **Frontend**:

   ```bash
   cd perpetual-dex/frontend && npm install && npm run dev
   ```

3. Cấu hình `perpetual-dex/frontend/.env` (`VITE_KEEPER_URL=http://localhost:3100`, địa chỉ contract, `VITE_WALLETCONNECT_PROJECT_ID` cho HashPack, v.v.) và `perpetual-dex/keeper/.env` (RPC Hedera, contract, khóa keeper/faucet/oracle).

Nếu UI báo **Failed to fetch** khi xin faucet: kiểm tra keeper đang chạy và `curl http://localhost:3100/health` trả `ok`.

## Tài liệu thêm

- `perpetual-dex/README.md` — kiến trúc và biến môi trường
- `perpetual-dex/keeper/README.md` — API keeper
- `perpetual-dex/frontend/README.md` — giao diện và wallet
