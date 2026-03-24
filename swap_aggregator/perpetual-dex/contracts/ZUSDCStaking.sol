// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZUSDCStaking
 * @notice Stake zUSDC, earn zUSDC rewards (same token for stake + reward).
 * @dev Classic StakingRewards pattern (Synthetix-style). Owner funds rewards via `fundRewards`.
 *      **Stake (deposit)**: uses IERC20 `transferFrom` after user `approve` — works with HashPack / ERC-20 facade on Hedera.
 *      **Withdraw / claim**: use HTS `transferTokens` (same as PerpetualDEX). **Funding**: see `fundRewards` + `fundStakingRewards.ts`.
 */
contract ZUSDCStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    /// @dev Hedera HTS precompile — associate + transfer (see HIP-206 / PerpetualDEX).
    address private constant HTS_PRECOMPILE = address(0x167);
    int64 private constant RESPONSE_SUCCESS = 22;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    /// @notice Length of one reward emission period (e.g. 90 days).
    uint256 public rewardsDuration;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event RewardFunded(uint256 amount, uint256 rewardRate, uint256 periodFinish);
    event TokenAssociated(address indexed token);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(
        address _stakingToken,
        address _rewardsToken,
        uint256 _rewardsDuration,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_stakingToken != address(0) && _rewardsToken != address(0), "zero addr");
        require(_rewardsDuration > 0, "duration");
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        rewardsDuration = _rewardsDuration;
    }

    /**
     * @notice Associate this contract with the staking/reward token on Hedera (HTS).
     * @dev Required once after deploy before `fundRewards`, `stake`, or paying rewards — same pattern as `PerpetualDEX.associateTradingToken`.
     */
    function associateTokens() external onlyOwner {
        address t = address(stakingToken);
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSignature("associateToken(address,address)", address(this), t)
        );
        require(ok && data.length >= 32, "HTS associate failed");
        int64 code = abi.decode(data, (int64));
        require(code == RESPONSE_SUCCESS || code == 194, "HTS associate status");
        emit TokenAssociated(t);
        if (address(rewardsToken) != t) {
            (ok, data) = HTS_PRECOMPILE.call(
                abi.encodeWithSignature("associateToken(address,address)", address(this), address(rewardsToken))
            );
            require(ok && data.length >= 32, "HTS associate reward failed");
            code = abi.decode(data, (int64));
            require(code == RESPONSE_SUCCESS || code == 194, "HTS associate reward status");
            emit TokenAssociated(address(rewardsToken));
        }
    }

    /// @dev HTS fungible transfer; `amount` is in token smallest units (e.g. 8 decimals for zUSDC).
    function _htsTransfer(address token, address from, address to, uint256 amount) private {
        require(amount > 0, "HTS: zero");
        // transferTokens uses int64 amounts; stay within int64 positive range
        require(amount <= uint256(uint256(int256(type(int64).max))), "HTS: amount too large");
        address[] memory accounts = new address[](2);
        accounts[0] = from;
        accounts[1] = to;
        int64[] memory amounts = new int64[](2);
        amounts[0] = -int64(uint64(amount));
        amounts[1] = int64(uint64(amount));
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSignature("transferTokens(address,address[],int64[])", token, accounts, amounts)
        );
        require(ok && data.length >= 32, "HTS transfer failed");
        int64 code = abi.decode(data, (int64));
        require(code == RESPONSE_SUCCESS, "HTS transfer status");
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        if (periodFinish == 0) {
            return block.timestamp;
        }
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        uint256 t = lastTimeRewardApplicable();
        // Avoid underflow when lastUpdateTime > t (e.g. period ended then state desync)
        if (t <= lastUpdateTime) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored + (t - lastUpdateTime) * rewardRate * 1e18 / _totalSupply;
    }

    function earned(address account) public view returns (uint256) {
        uint256 rpt = rewardPerToken();
        uint256 paid = userRewardPerTokenPaid[account];
        if (rpt <= paid) {
            return rewards[account];
        }
        return (_balances[account] * (rpt - paid) / 1e18) + rewards[account];
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "stake: zero");
        _totalSupply += amount;
        _balances[msg.sender] += amount;
        // ERC-20 transferFrom (HTS facade): matches Approve in UI + HashPack; HTS precompile pull often reverts here.
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, "withdraw: zero");
        _totalSupply -= amount;
        _balances[msg.sender] -= amount;
        _htsTransfer(address(stakingToken), address(this), msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            _htsTransfer(address(rewardsToken), address(this), msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        uint256 bal = _balances[msg.sender];
        if (bal > 0) {
            withdraw(bal);
        }
        getReward();
    }

    /// @notice After owner has sent `rewardAmount` of zUSDC to this contract (IERC20 `transfer` from owner EOA), starts/extends emission.
    /// @dev On Hedera, do not rely on `approve` + HTS pull from owner — use `transfer` then this call (see `fundStakingRewards.ts`).
    function fundRewards(uint256 rewardAmount) external onlyOwner updateReward(address(0)) {
        require(rewardAmount > 0, "fund: zero");
        _notifyRewardAmount(rewardAmount);
    }

    function setRewardsDuration(uint256 newDuration) external onlyOwner {
        require(newDuration > 0, "duration");
        require(block.timestamp > periodFinish || periodFinish == 0, "period active");
        rewardsDuration = newDuration;
        emit RewardsDurationUpdated(newDuration);
    }

    function _notifyRewardAmount(uint256 reward) internal {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        require(rewardRate > 0 || reward == 0, "fund: reward too small");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardFunded(reward, rewardRate, periodFinish);
    }
}
