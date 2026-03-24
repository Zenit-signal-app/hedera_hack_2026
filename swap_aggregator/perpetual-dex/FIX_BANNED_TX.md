# Sửa lỗi "Transaction temporarily banned"

> **Hedera Testnet (dự án hiện tại):** Dùng **HashPack** và đặt RPC **Hedera Testnet** (ví dụ `https://testnet.hashio.io/api`). Lỗi “temporarily banned” thường liên quan RPC node — đổi RPC trong cài đặt mạng của ví. Phần dưới đây mô tả kịch bản **MetaMask + Polkadot EVM** (tham khảo lịch sử repo).

## Nguyên nhân

**Ví (MetaMask) gửi giao dịch qua RPC mà ví đang cấu hình**, không phải RPC trong `.env` của frontend. Nếu ví vẫn dùng RPC cũ (đã ban địa chỉ của bạn), lỗi sẽ tiếp tục xảy ra.

---

## Cách sửa: Đổi RPC trong MetaMask

### Bước 1: Mở MetaMask → Settings → Networks

### Bước 2: Tìm "Polkadot Hub TestNet" (Chain ID: 420420417)

- Nếu **chưa có**: Add network → chọn Polkadot Testnet hoặc thêm thủ công
- Nếu **đã có**: Click vào network → Edit

### Bước 3: Đổi RPC URL

- **RPC URL cũ (có thể bị ban):** `https://eth-rpc-testnet.polkadot.io/`
- **RPC URL mới (thay thế):** `https://services.polkadothub-rpc.com/testnet/`

Thay thế hoàn toàn RPC URL cũ bằng RPC URL mới, rồi Save.

### Bước 4: Thử lại giao dịch

Refresh trang dApp và thử lại giao dịch.

---

## Cách khác: Dùng ví/địa chỉ mới

Nếu ban đã lan sang nhiều node, thử:

1. **Tạo ví mới** trong MetaMask (Add account)
2. **Chuyển ví sang ví khác** (ví dụ Rabby, WalletConnect)
3. Dùng địa chỉ mới để kết nối và giao dịch

---

## Thông tin network cần thiết

| Trường | Giá trị |
|--------|---------|
| Network Name | Polkadot Hub TestNet |
| RPC URL | `https://services.polkadothub-rpc.com/testnet/` |
| Chain ID | 420420417 |
| Currency | PAS |
| Explorer | https://blockscout-testnet.polkadot.io |
