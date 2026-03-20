# Lệnh chạy dev — Zenit Perpetual DEX (Hedera Testnet)

> Bản mẫu trong repo. Bạn có thể copy thành `command.md` (file local, không commit) nếu cần.

Chạy **keeper trước** (API faucet + TP/SL + đồng bộ orders). Sau đó chạy **frontend**.

## Keeper (cổng mặc định `3100`)

```bash
cd perpetual-dex/keeper
npm install
npx prisma generate
npm run dev
```

Kiểm tra: `curl http://localhost:3100/health`

## Frontend (Vite — URL xem trong terminal, thường `http://localhost:5173` hoặc `http://127.0.0.1:3000`)

```bash
cd perpetual-dex/frontend
npm install
npm run dev
```

## Ghi chú

- `frontend/.env`: cần `VITE_KEEPER_URL` trỏ tới keeper (local: `http://localhost:3100`). Sau khi sửa `.env`, restart `npm run dev`.
- `keeper/.env`: `RPC_URL`, `CHAIN_ID=296`, địa chỉ contract, `FAUCET_PRIVATE_KEY` / `FAUCET_HTS_TOKEN_ID`, v.v.
