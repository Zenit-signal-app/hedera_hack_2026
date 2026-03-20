# Tính năng smart contract của Perp DEX

## 1. Tổng quan
- Bộ smart contract tập trung xung quanh `PerpetualDEX.sol`, cung cấp các thao tác cơ bản của một sàn perpetual (deposit/withdraw, mở/đóng/gia tăng vị thế dùng đòn bẩy) và dùng token `zUSDC` làm tài sản giao dịch.
- Hợp đồng `RewardContract.sol` theo dõi khối lượng giao dịch theo “season” để phân phối phần thưởng tương đương.
- Token `zUSDC` được phát hành theo chuẩn ERC20 (file `RewardToken.sol`), và được dùng để nạp vào sàn trước khi mở hoặc tăng vị thế.

## 2. `PerpetualDEX.sol`
- Sử dụng `IERC20`, `Ownable`, `ReentrancyGuard` từ OpenZeppelin để đảm bảo an toàn.
- Người dùng nạp `zUSDC` vào thông qua hàm `deposit`, và rút lại bằng `withdraw` (cả hai đều phát ra sự kiện tương ứng).
- Mỗi người dùng được ghi nhận số dư và thông tin vị thế trong mapping `balances` và `positions`.
- `openPosition` kiểm tra đủ số dư, chưa có vị thế mở rồi trừ số dư, tạo position mới và cập nhật reward (gọi `_setReward`).
- `increasePosition` thêm margin vào vị thế hiện hữu, cũng cập nhật reward theo đòn bẩy.
- `closePosition` giảm margin, nếu đóng hết thì xóa vị thế và trả số dư lại; mọi thao tác vị thế đều gọi `_setReward`.
- Gọi `_setReward` đẩy thông tin khối lượng (amount × leverage) vào `RewardContract` để chuẩn bị phần thưởng.
- Hàm `getCurrentPosition`, `balanceOf`, `getTokenAddress`, `getRewardContractAddress` cung cấp dữ liệu readonly cho giao diện frontend.

## 3. `RewardContract.sol`
- Chỉ cho phép `PerpetualDEX` gọi `setUserReward`, chỉ chủ sở hữu mới chọn địa chỉ DEX.
- Theo dõi khối lượng giao dịch tích luỹ theo từng "season" 30 ngày bằng các mapping `cumulativeTraderVolumeForMarket`, `cumulativeMarketVolume`, `cumulativeRewardForUserBySeason`.
- `claimReward` cho phép người dùng rút reward đã được cập nhật theo từng season.
- `setUserReward` được gọi mỗi khi mở/gia tăng/đóng vị thế để cập nhật khối lượng dùng để tính phần thưởng.
- Tính phần thưởng dựa trên tỷ lệ khối lượng riêng người dùng trên tổng khối lượng mùa đó, nhân với hệ số `REWARD_RATE`.

## 4. Token
- `RewardToken` triển khai ERC20 `zUSDC` (tên đầy đủ zUSDC, ký hiệu zUSDC) và mint 500 triệu đơn vị cho deployer. Đây là token được dùng để đặt cọc trên `PerpetualDEX` và nhận thưởng khi claim reward.

## 5. Luồng tương tác
1. Deploy `RewardToken`, sau đó deploy `RewardContract` với địa chỉ token.
2. Gán lại địa chỉ DEX vào reward contract để cho phép DEX cập nhật reward.
3. Deploy `PerpetualDEX` với địa chỉ token và reward contract. Người dùng approve và deposit zUSDC vào DEX.
4. Khi mở/gia tăng/đóng vị thế, DEX trừ/số dư, cập nhật state position và gọi reward contract để cộng khối lượng.
5. Người dùng gọi `claimReward` trên reward contract để rút phần thưởng, dựa trên khối lượng tích lũy từng season.

## 6. Bảo mật & Khác
- Các hàm rút tiền và close position có `require` kiểm tra dữ liệu đầu vào (amout/trạng thái).
- Dùng `ReentrancyGuard` để ngăn reentrancy khi withdraw/claim reward.
- Hợp đồng quyền sở hữu (`Ownable`) cho phép chỉ owner mới cài địa chỉ DEX (reward contract) nếu cần.
