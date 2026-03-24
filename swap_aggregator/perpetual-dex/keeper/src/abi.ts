// ─── Human-readable ABI fragments (ethers.js v6 format) ─────────────────────

export const PERPETUAL_DEX_ABI_HUMAN = [
  // ─── Core user functions ────────────────────────────────────────────────────
  "function deposit(uint256 _amount)",
  "function depositFor(address _user, uint256 _amount)",
  "function withdraw(uint256 _amount)",
  "function openPosition(bytes32 _market, uint256 _amount, uint8 _positionType, uint8 _leverage)",
  "function increasePosition(bytes32 _market, uint256 _amount)",
  "function closePosition(bytes32 _market, uint256 _amount)",
  "function balanceOf(address _account) view returns (uint256)",
  "function getCurrentPosition(address user, bytes32 market) view returns (tuple(uint256 amount, uint8 position, uint8 leverage, uint256 entryPriceE18))",
  "function getTokenAddress() view returns (address)",

  // ─── Keeper-specific functions ──────────────────────────────────────────────
  "function keeperClosePosition(address _user, bytes32 _market, uint256 _amount, uint256 _closePrice) returns (uint256 keeperReward)",
  "function recordClosureHistory(address _user, bytes32 _market, int256 _pnl, uint256 _durationSec, uint256 _entryPrice, uint256 _closePrice, uint8 _side, uint8 _leverage)",
  "function claimKeeperReward() returns (uint256 amount)",
  "function pendingKeeperReward(address _keeper) view returns (uint256)",
  "function returnMargin(address _user, uint256 _marginAmount, int256 _pnl)",

  // ─── Events ─────────────────────────────────────────────────────────────────
  "event PositionOpened(address indexed user, bytes32 indexed market, uint256 amount, uint8 positionType, uint8 leverage)",
  "event PositionClosed(address indexed user, bytes32 indexed market, uint256 amount, int256 pnl)",
  "event PositionIncreased(address indexed user, bytes32 indexed market, uint256 amount)",
  "event PositionLiquidated(address indexed user, bytes32 indexed market, uint256 amount, int256 pnl)",
  "event Deposit(address indexed user, uint256 amount)",
  "event Withdrawal(address indexed user, uint256 amount)",
  "event KeeperRewardClaimed(address indexed keeper, uint256 amount)",
  "event ClosureRecorded(address indexed user, bytes32 indexed market, int256 pnl)",
] as const;

// ─── JSON ABI (used by viem in eventListener.ts) ─────────────────────────────

export const PERPETUAL_DEX_ABI = [
  { inputs: [{ name: "_amount", type: "uint256" }], name: "deposit", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_amount", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }, { name: "_positionType", type: "uint8" }, { name: "_leverage", type: "uint8" }], name: "openPosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }], name: "increasePosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }], name: "closePosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "market", type: "bytes32" }], name: "getCurrentPosition", outputs: [{ components: [{ name: "amount", type: "uint256" }, { name: "position", type: "uint8" }, { name: "leverage", type: "uint8" }, { name: "entryPriceE18", type: "uint256" }], type: "tuple" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getTokenAddress", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "_user", type: "address" }, { name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }, { name: "_closePrice", type: "uint256" }], name: "keeperClosePosition", outputs: [{ name: "keeperReward", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_user", type: "address" }, { name: "_market", type: "bytes32" }, { name: "_pnl", type: "int256" }, { name: "_durationSec", type: "uint256" }, { name: "_entryPrice", type: "uint256" }, { name: "_closePrice", type: "uint256" }, { name: "_side", type: "uint8" }, { name: "_leverage", type: "uint8" }], name: "recordClosureHistory", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "claimKeeperReward", outputs: [{ name: "amount", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_keeper", type: "address" }], name: "pendingKeeperReward", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "_user", type: "address" }, { name: "_marginAmount", type: "uint256" }, { name: "_pnl", type: "int256" }], name: "returnMargin", outputs: [], stateMutability: "nonpayable", type: "function" },

  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: true, name: "market", type: "bytes32" }, { indexed: false, name: "amount", type: "uint256" }, { indexed: false, name: "positionType", type: "uint8" }, { indexed: false, name: "leverage", type: "uint8" }], name: "PositionOpened", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: true, name: "market", type: "bytes32" }, { indexed: false, name: "amount", type: "uint256" }, { indexed: false, name: "pnl", type: "int256" }], name: "PositionClosed", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: true, name: "market", type: "bytes32" }, { indexed: false, name: "amount", type: "uint256" }], name: "PositionIncreased", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: true, name: "market", type: "bytes32" }, { indexed: false, name: "amount", type: "uint256" }, { indexed: false, name: "pnl", type: "int256" }], name: "PositionLiquidated", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: false, name: "amount", type: "uint256" }], name: "Deposit", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: false, name: "amount", type: "uint256" }], name: "Withdrawal", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "keeper", type: "address" }, { indexed: false, name: "amount", type: "uint256" }], name: "KeeperRewardClaimed", type: "event" },
  { anonymous: false, inputs: [{ indexed: true, name: "user", type: "address" }, { indexed: true, name: "market", type: "bytes32" }, { indexed: false, name: "pnl", type: "int256" }], name: "ClosureRecorded", type: "event" },
] as const;

export const POSITION_CLOSED_EVENT = PERPETUAL_DEX_ABI.find(
  (item) => item.type === "event" && item.name === "PositionClosed",
)!;

export function symbolToBytes32(symbol: string): `0x${string}` {
  let hex = "";
  for (let i = 0; i < symbol.length; i++) {
    hex += symbol.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `0x${hex}${"0".repeat(64 - hex.length)}` as `0x${string}`;
}
