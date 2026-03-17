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
scripts/       - Shell helper scripts (local node, deploy-custom) — git-ignored
test/          - Test files (currently empty; use forge test when added)
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

# Standard networks
forge script script/Vault.s.sol:VaultScript --rpc-url <network> --broadcast

# Custom network (uses deploy-custom.sh with balance check + confirmation)
bash scripts/deploy-custom.sh

# Local network via helper script
bash scripts/deploy-custom.sh --network hedera_local
```

`scripts/deploy-custom.sh` writes deployment artifacts to:

- `deploy/<network>/vault.yaml` (network, manager, contract, tx hash, timestamp, token config)
- `deploy/<network>/vault.deploy.log` (raw forge output)

If broadcasting fails, the script still writes both files with:

- `deployment.status: failed`
- `deployment.exit_code: <non-zero>`

so failed deployments are auditable/debuggable.

### Token Deployment

Deploy ERC20 tokens (USDC, TOKEN_A) to a Hedera network:

```bash
# Deploy tokens to local node (uses OPERATOR_KEY from .env)
bash scripts/deploy-token.sh

# Deploy to local with explicit RPC
bash scripts/deploy-token.sh hedera_local http://localhost:7546

# Deploy to testnet
bash scripts/deploy-token.sh hedera_testnet https://testnet.hashio.io/api
```

The script deploys:
- **USDC**: 6 decimals, 1,000,000 initial supply
- **TOKEN_A**: 18 decimals, 1,000,000 initial supply

Deployment artifacts are written to `deploy/<network>/token.yaml`.

### Local Development Node (Hiero)
To run a local Hedera dev environment using Hiero Local Node:

```bash
# One-time setup: clone hiero-local-node and install dependencies
bash scripts/setup-local-node.sh

# Start node (spins up Docker containers)
bash scripts/start-local-node.sh

# Stop when done
bash scripts/stop-local-node.sh
```

The Hiero Local Node includes:
- Consensus Node, Mirror Node and explorer
- JSON-RPC Relay at `http://localhost:7546`
- Block Node, Grafana UI, and Prometheus UI

The `start-local-node.sh` script:
- Generates a single `OPERATOR_KEY` in `.env` (used for all networks)
- Starts all Hiero containers via `npm run start`
- JSON-RPC endpoint: `http://localhost:7546`

Note: `forge test` runs on Anvil, NOT a Hedera node. For Hedera-specific testing, deploy to the local dev node.

---

## Related Documentation

- `.agents/skills/solidity-development/SKILL.md` - Development patterns
- `.agents/skills/solidity-security/SKILL.md` - Security best practices
- `README.md` - Project overview
