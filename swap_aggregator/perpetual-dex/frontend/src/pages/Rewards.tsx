import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { Link } from "react-router-dom";
import { CONTRACTS } from "@/config/contracts";
import { REWARD_ABI } from "@/abis/Reward";

export default function Rewards() {
  const { address } = useAccount();

  const { data: claimableReward } = useReadContract({
    address: CONTRACTS.REWARD,
    abi: REWARD_ABI,
    functionName: "totalClaimableRewardForUser",
    args: address ? [address] : undefined,
  });

  const { writeContract: claimReward, data: claimHash } = useWriteContract();
  const { isLoading: isClaimPending } = useWaitForTransactionReceipt({ hash: claimHash });

  const handleClaim = () => {
    claimReward({ address: CONTRACTS.REWARD, abi: REWARD_ABI, functionName: "claimReward" });
  };

  if (!address) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-12 text-center">
          <div className="text-6xl mb-4">🎁</div>
          <h1 className="text-2xl font-semibold text-white mb-2">Rewards</h1>
          <p className="text-slate-400 mb-6">Connect your wallet to view and claim trading rewards</p>
          <Link to="/" className="inline-block px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium">
            Connect Wallet
          </Link>
        </div>
      </div>
    );
  }

  const reward = claimableReward ?? 0n;
  const hasReward = reward > 0n;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Rewards</h1>
        <p className="text-slate-400 text-sm">Earn RWD tokens based on your trading volume</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-2xl">💰</div>
            <div>
              <div className="text-slate-400 text-sm">Claimable</div>
              <div className="text-2xl font-bold text-green-500">{formatUnits(reward, 18)} RWD</div>
            </div>
          </div>
          <button
            onClick={handleClaim}
            disabled={!hasReward || isClaimPending}
            className="w-full py-3.5 rounded-xl font-semibold bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
          >
            {isClaimPending ? "Claiming..." : hasReward ? "Claim Reward" : "No reward to claim"}
          </button>
        </div>

        <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-6">
          <div className="text-slate-400 text-sm mb-2">How it works</div>
          <ul className="text-slate-300 text-sm space-y-2">
            <li>• Trade to earn volume-based rewards</li>
            <li>• Rewards distributed every 30 days</li>
            <li>• Claim anytime during the season</li>
          </ul>
          <Link to="/" className="inline-block mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium">
            Start Trading →
          </Link>
        </div>
      </div>
    </div>
  );
}
