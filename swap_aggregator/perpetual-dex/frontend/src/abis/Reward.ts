export const REWARD_ABI = [
  { inputs: [], name: "claimReward", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "totalClaimableRewardForUser", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;
