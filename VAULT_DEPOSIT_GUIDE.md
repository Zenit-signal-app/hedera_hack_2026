# Vault Deposit Integration Guide

## Overview

Tính năng deposit mới cho phép người dùng gửi ADA trực tiếp vào vault smart contract thông qua wallet của họ, thay vì phải gọi qua backend API.

## Architecture

### Flow mới (Wallet-signed)
```
User → Frontend (Hook) → Smart Contract (Lucid)
        ↑ User signs with wallet
```

Deposit không còn call qua backend API hay service layer nữa. Hook gọi trực tiếp các functions từ `lib/vault-transaction.ts` để build và submit transaction lên blockchain.

## Files Created/Modified

### New Files
1. **`lib/vault-transaction.ts`** - Helper functions để build và submit vault transactions
2. **`hooks/useVaultDeposit.ts`** - React hook để handle deposit operations

### Modified Files
1. **`services/vaultServices.ts`** - Thêm `depositToVaultDirect()` function

## Usage

### 1. Setup Environment Variables

Thêm Blockfrost API key vào `.env.local`:

```env
NEXT_PUBLIC_BLOCKFROST_API_KEY=your_blockfrost_api_key_here
```

### 2. Get Vault Configuration

Trước khi deposit, cần lấy thông tin vault configuration:

```typescript
import { vaultApi } from '@/services/vaultServices';

// Get vault info
const vaultInfo = await vaultApi.getVaultInfo(vaultId);

// Prepare vault config
const vaultConfig = {
  vault_address: vaultInfo.address,      // Vault script address 
  pool_id: vaultInfo.pool_id,            // NFT asset name (hex)
  min_lovelace: 2_000_000,               // 2 ADA minimum (or get from API)
};
```

### 3. Use the Hook in Component

```typescript
import { useVaultDeposit } from '@/hooks/useVaultDeposit';
import { useState } from 'react';

function DepositComponent({ vaultId }: { vaultId: string }) {
  const { deposit, isDepositing, error, txHash } = useVaultDeposit();
  const [amount, setAmount] = useState('');

  const handleDeposit = async () => {
    // Get vault config (from props, context, or API)
    const vaultConfig = {
      vault_address: 'addr_test1...',
      pool_id: 'abc123...',
      min_lovelace: 2_000_000,
    };

    // Deposit
    const txHash = await deposit(vaultConfig, parseFloat(amount));
    
    if (txHash) {
      console.log('Transaction submitted:', txHash);
      // Update UI, show success message, etc.
    }
  };

  return (
    <div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (ADA)"
        disabled={isDepositing}
      />
      
      <button onClick={handleDeposit} disabled={isDepositing}>
        {isDepositing ? 'Depositing...' : 'Deposit'}
      </button>

      {error && <div className="error">{error}</div>}
      {txHash && (
        <div className="success">
          Transaction: {txHash}
        </div>
      )}
    </div>
  );
}
```

### 4. Direct Function Usage (without hook)

Nếu không muốn dùng hook, có thể gọi trực tiếp functions từ `lib/vault-transaction.ts`:

```typescript
import { 
  initializeLucid, 
  depositToVaultContract, 
  adaToLovelace 
} from '@/lib/vault-transaction';
import { useWalletStore } from '@/store/walletStore';

async function depositDirectly() {
  const activeWallet = useWalletStore.getState().activeWallet;
  const networkId = useWalletStore.getState().networkId;

  if (!activeWallet) {
    throw new Error('Wallet not connected');
  }

  const vaultConfig = {
    vault_address: 'addr_test1...',
    pool_id: 'abc123...',
    min_lovelace: 2_000_000,
  };

  const network = networkId === 1 ? 'Mainnet' : 'Preview';
  const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!;

  // Initialize Lucid with wallet
  const lucid = await initializeLucid(network, blockfrostApiKey, activeWallet);

  // Convert ADA to lovelace
  const amountLovelace = adaToLovelace(10); // 10 ADA

  // Build, sign, and submit transaction
  const txHash = await depositToVaultContract(
    lucid,
    vaultConfig,
    amountLovelace
  );

  console.log('Transaction hash:', txHash);
}
```

## Technical Details

### DepositDatum Structure

Theo `vault_migration.md`, DepositDatum bao gồm:

```python
# On-chain structure
DepositDatum = {
  contributor_address: bytes,  # Payment credential
  pool_id: bytes,              # NFT asset name (hex)
}
```

TypeScript implementation:

```typescript
const DepositDatumSchema = Data.Object({
  contributor_address: Data.Bytes(),
  pool_id: Data.Bytes(),
});
```

### Transaction Building

Transaction được build với Lucid:

1. **Extract payment credential** từ contributor address
2. **Build datum** với contributor address và pool_id
3. **Create transaction** gửi ADA đến vault script address
4. **Attach datum** inline với transaction
5. **Sign** với wallet
6. **Submit** lên blockchain

### Minimum Deposit

Theo Cardano protocol, minimum lovelace để gửi đến script address là khoảng **2 ADA** (2,000,000 lovelace). Giá trị chính xác phụ thuộc vào size của datum.

## Error Handling

Hook tự động handle các lỗi phổ biến:

- ❌ **Wallet not connected**: Yêu cầu người dùng connect wallet
- ❌ **Amount too low**: Kiểm tra minimum deposit
- ❌ **Network mismatch**: Đảm bảo wallet đang ở đúng network
- ❌ **Transaction failed**: Hiển thị error message từ blockchain

## Testing

### On Testnet (Preview)

1. Connect testnet wallet (Preview network)
2. Get test ADA from faucet
3. Use testnet vault addresses
4. Set `NEXT_PUBLIC_BLOCKFROST_API_KEY` to Preview network key

### On Mainnet

1. Connect mainnet wallet
2. Use mainnet vault addresses  
3. Set `NEXT_PUBLIC_BLOCKFROST_API_KEY` to Mainnet network key
4. Test with small amounts first

## Migration from Old Deposit

### Before (Backend-signed)

```typescript
await vaultApi.depositToVault({
  vault_id: vaultId,
  pool_id: poolId,
  amount_ada: 10,
  amount_lovelace: 10_000_000,
  contributor_address: userAddress,
});
```

### After (Wallet-signed)

```typescript
const { deposit } = useVaultDeposit();

await deposit(
  {
    vault_address: vaultAddress,
    pool_id: poolId,
    min_lovelace: 2_000_000,
  },
  10 // ADA
);
```

## Benefits

✅ **Trustless**: User giữ full control của private keys  
✅ **Transparent**: User thấy rõ transaction trước khi sign  
✅ **Decentralized**: Không phụ thuộc vào backend để sign  
✅ **Secure**: Backend không bao giờ có access đến user's keys  

## Limitations

⚠️ **Requires wallet**: User phải có và connect Cardano wallet  
⚠️ **Gas fees**: User phải trả transaction fees (thường < 0.2 ADA)  
⚠️ **Blockfrost dependency**: Cần Blockfrost API key để submit transactions  

## References

- [vault_migration.md](../vault_migration.md) - On-chain contract specifications
- [Lucid Documentation](https://github.com/spacebudz/lucid) - Transaction building library
- [CIP-30](https://cips.cardano.org/cips/cip30/) - Cardano wallet connector standard
