/** Convert symbol string to bytes32 for contract calls */
export function symbolToBytes32(symbol: string): `0x${string}` {
  let hex = "";
  for (let i = 0; i < symbol.length; i++) {
    hex += symbol.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `0x${hex}${"0".repeat(64 - hex.length)}` as `0x${string}`;
}

export const PERPETUAL_DEX_ABI = [
  { inputs: [{ name: "_amount", type: "uint256" }], name: "deposit", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_user", type: "address" }, { name: "_amount", type: "uint256" }], name: "depositFor", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_amount", type: "uint256" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }, { name: "_positionType", type: "uint8" }, { name: "_leverage", type: "uint8" }], name: "openPosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }], name: "increasePosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_market", type: "bytes32" }, { name: "_amount", type: "uint256" }], name: "closePosition", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "_account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "market", type: "bytes32" }], name: "getCurrentPosition", outputs: [{ components: [{ name: "amount", type: "uint256" }, { name: "position", type: "uint8" }, { name: "leverage", type: "uint8" }, { name: "entryPriceE18", type: "uint256" }], type: "tuple" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getTokenAddress", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
] as const;
