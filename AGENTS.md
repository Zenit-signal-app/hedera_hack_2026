# AGENTS.md - Development Guidelines for This Repository

This is a Solidity smart contract project using Foundry for development.

## Build / Lint / Test Commands

### Compilation
```bash
forge build              # Compile all contracts
forge build --sizes     # Compile and show contract sizes
forge build --optimizer  # Compile with optimizer
```

### Testing
```bash
forge test              # Run all tests
forge test -vvv         # Run with verbose output
forge test --match-test testName  # Run single test
forge test --match-contract VaultTest  # Run tests for specific contract
```

### Formatting
```bash
forge fmt               # Format Solidity code
forge fmt --check       # Check formatting without modifying
```

### Gas Snapshots
```bash
forge snapshot         # Generate gas snapshot
forge snapshot --diff  # Compare with previous snapshot
```

### Other Commands
```bash
forge coverage         # Generate coverage report
forge clean            # Clear build artifacts
```

---

## Code Style Guidelines

### Solidity Version
- Use Solidity `^0.8.22` (matches project pragma)
- Avoid floating pragmas in production contracts

### File Structure
```
src/           - Main contract files (Vault.sol, VaultConfig.sol)
script/        - Forge deployment scripts (Vault.s.sol)
scripts/       - JavaScript deployment scripts (deploy-vault.js, create-hts-token.js)
test/          - Test files
config/        - Config generator (genConfig.js, vaultConfig.json)
docs/          - Documentation (currently empty)
```

> Note: `src/VaultConfig.sol` is auto-generated — do not edit directly.

### Imports
- Use OpenZeppelin contracts from remappings:
  ```
  @openzeppelin/contracts/
  forge-std/
  ```
- Order imports: external → internal → contract-specific
- Example:
  ```solidity
  import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
  import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
  import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
  import "@openzeppelin/contracts/access/Ownable.sol";
  ```

### Naming Conventions
- **Contracts**: PascalCase (e.g., `Vault`, `VaultConfig`)
- **Functions**: camelCase (e.g., `deposit`, `withdraw`)
- **Variables**: camelCase (e.g., `token1`, `maxShareholders`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_SHAREHOLDERS`)
- **Events**: PascalCase with prefix (e.g., `Deposited`, `Withdrawn`)
- **Modifiers**: snake_case (e.g., `onlyBeforeRun`, `onlyManager`)

### Code Organization

#### State Variables
- Group by visibility: public → private → internal
- Use NatSpec comments for public variables:
  ```solidity
  /// @notice The token that can be deposited into the vault
  ERC20 public token1;
  ```

#### Functions
- Order: constructor → external → public → internal → private → view
- Use modifiers for access control (see Security below)
- Emit events for state changes

#### Modifiers
- Place modifiers before visibility:
  ```solidity
  function deposit(uint256 amount) external onlyBeforeRun notMaxShareholders nonReentrant {
  ```

### Types
- Use `uint256` for monetary values and timestamps
- Use `address` for addresses
- Use `bytes calldata` for dynamic calldata parameters
- Use `memory` for temporary variables within functions

### Error Handling
- Use custom errors (Solidity 0.8.4+):
  ```solidity
  error InsufficientBalance(address user, uint256 requested, uint256 available);
  ```
- Use `require` with descriptive messages:
  ```solidity
  require(amount > 0, "Vault: Amount must be greater than 0");
  ```

### Security Guidelines
Follow the `solidity-security` skill guidelines. Key points:

1. **Checks-Effects-Interactions**: Always update state before external calls
2. **Reentrancy Protection**: Use `ReentrancyGuard` modifier
3. **Access Control**: Use `Ownable` or custom modifiers
4. **Input Validation**: Validate all inputs (zero address, bounds)
5. **Safe ERC20**: Use `SafeERC20` for token transfers

### NatSpec Documentation
Document all public/external functions:
```solidity
/**
 * @notice Deposit token1 into the vault (only before run timestamp)
 * @param amount Amount of token1 to deposit
 */
function deposit(uint256 amount) external onlyBeforeRun { ... }
```

### Layout
- Use 4 spaces for indentation
- One blank line between top-level declarations
- Max line length: 120 characters (soft limit)

---

## Project-Specific Notes

### Configuration
- Configuration is auto-generated: edit `config/vaultConfig.json`, then run:
  ```bash
  node config/genConfig.js <network>  # hedera_local, hedera_testnet, hedera_mainnet, custom
  ```
- Do not edit `src/VaultConfig.sol` directly

### Network Support
| Network | Description | Chain ID |
|---|---|---|
| `hedera_local` | Local dev node (Hiero Local Node via Docker) | 298 |
| `hedera_testnet` | Hedera Testnet | 296 |
| `hedera_mainnet` | Hedera Mainnet | 295 |
| `custom` | Any EVM-compatible chain — set `CUSTOM_RPC_URL` in `.env` | configurable |

The `custom` network also supports optional `chainId` and `rpcUrl` metadata fields in `vaultConfig.json` — these are embedded as comments in the generated `VaultConfig.sol`.

### Deployment
```bash
cp .env.example .env
# Edit .env with your OPERATOR_KEY and RPC URLs

# Deploy with auto-association (recommended)
node scripts/deploy-vault.js --network hedera_testnet

# Deploy to local
node scripts/deploy-vault.js --network hedera_local

# Dry-run to test
node scripts/deploy-vault.js --network hedera_testnet --dry-run
```

The script:
1. Generates `VaultConfig.sol` from `config/vaultConfig.json`
2. Builds with Forge
3. Deploys via Foundry
4. Updates contract with unlimited auto-associations (`-1`)

`scripts/deploy-custom.sh` writes deployment artifacts to:

- `deploy/<network>/vault.yaml` (network, manager, contract, tx hash, timestamp, token config)
- `deploy/<network>/vault.deploy.log` (raw forge output)

If broadcasting fails, the script still writes both files with:

- `deployment.status: failed`
- `deployment.exit_code: <non-zero>`

so failed deployments are auditable/debuggable.

### Token Deployment

Deploy HTS fungible tokens using the JavaScript SDK:

```bash
# Deploy token to testnet
node scripts/create-hts-token.js \
  --network hedera_testnet \
  --name "My Token" \
  --symbol MTK \
  --initial-supply 1000000

# Deploy to local
node scripts/create-hts-token.js \
  --network hedera_local \
  --name "Test Token" \
  --symbol TT \
  --decimals 6 \
  --initial-supply 1000000
```

Deployment artifacts are written to `deploy/<network>/hts-token.json`.

### Local Development Node (Hiero)
To run a local Hedera dev environment using Hiero Local Node:

```bash
# Start local node (requires Docker)
docker compose up -d

# JSON-RPC endpoint: http://localhost:7546
```

Note: `forge test` runs on Anvil, NOT a Hedera node. For Hedera-specific testing, deploy to the local dev node.

---

## Related Documentation

### HTS Token Support

The Vault uses the Hedera Token Service (HTS) precompile (`0x167`) to interact with native Hedera tokens. Key implementation details:

- **IHederaTokenService interface**: Defined in `src/Vault.sol` for HTS precompile calls
- **HTS detection**: `_isHts()` checks if token has empty bytecode (HTS tokens have no EVM code)
- **Helper functions**:
  - `_htsSafeTransfer()` - transfer tokens via HTS
  - `_htsSafeTransferFrom()` - transferFrom via HTS
  - `_htsSafeApprove()` - approve via HTS
  - `_htsGetBalance()` - get HTS token balance
  - `_safeTransferToken()` / `_safeTransferFromToken()` / `_safeApproveToken()` - unified wrappers
- **int64 amounts**: HTS requires `int64` - cast from `uint256` with inline comment explaining safety
- **Response codes**: HTS returns `int256` response code (22 = SUCCESS) - must check manually

### Association Handling

- Deposit functions assume vault is already associated with tokens
- `userWithdraw()` calls `_checkAssociation()` to verify account is associated with HTS tokens

---

- `.agents/skills/solidity-development/SKILL.md` - Development patterns
- `.agents/skills/solidity-security/SKILL.md` - Security best practices
- `README.md` - Project overview
