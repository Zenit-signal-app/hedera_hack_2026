import { CalculateRewardRequest } from "./models";

export function calculateEstimatedReward(trades: CalculateRewardRequest[]) {
  let totalReward = 0n;

  const multiplier = 1000000000000000000n;
  const rewardRate = 387n;
  const divisor = 1000n;

  for (const trade of trades) {
    const cumulatedRewardForTrader =
      trade.traderVolume * rewardRate * multiplier;

    const dividedValue = cumulatedRewardForTrader / divisor;

    const reward = dividedValue / trade.marketVolume;

    totalReward += reward;
  }

  return totalReward;
}
