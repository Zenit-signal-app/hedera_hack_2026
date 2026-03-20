// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Interface for the reward contract in a decentralized trading platform.
 */
interface IRewardContract {
    /**
     * @dev Emitted when a reward is claimed by a user.
     * @param user The address of the user who claimed the reward.
     * @param amount The amount of the reward claimed.
     */
    event RewardClaimed(address indexed user, uint256 amount);

    /**
     * @dev Emitted when a reward is set for a user.
     * @param user The address of the user for whom the reward is set.
     * @param amount The amount of the reward set for the user.
     */
    event RewardSet(address indexed user, uint256 amount);

    /**
     * @dev Emitted when the address of the DEX contract is set.
     * @param dexContractAddress The address of the DEX contract that has been set.
     */
    event DEXContractAddressSet(address indexed dexContractAddress);

    /**
     * @dev Sets the reward for a specific user.
     * This function can be called externally, typically by a privileged contract or entity.
     * @param _amount The amount of the reward to set for the user.
     * @param user The address of the user for whom the reward is being set.
     */
    function setUserReward(uint256 _amount, address user) external;

    /**
     * @dev Allows users to claim their rewards.
     * This function can be called externally by any user with a claimable reward.
     */
    function claimReward() external;

    /**
     * @dev Sets the address of the DEX contract.
     * This function can be called externally, typically by a privileged contract or entity.
     * @param _dexContractAddress The address of the DEX contract to set.
     */
    function setDEXContractAddress(address _dexContractAddress) external;

    /**
     * @dev Retrieves the cumulative trading volume for a specific user in a given market season.
     * This function can be called externally and is read-only.
     * @param marketSeason The market season identifier.
     * @param user The address of the user.
     * @return uint256 The cumulative trading volume of the user in the specified market season.
     */
    function getCumulativeTraderVolumeByMarket(
        uint256 marketSeason,
        address user
    ) external view returns (uint256);

    /**
     * @dev Retrieves the cumulative trading volume for a given market season.
     * This function can be called externally and is read-only.
     * @param marketSeason The market season identifier.
     * @return uint256 The cumulative trading volume in the specified market season.
     */
    function getCumulativeVolumeByMarket(
        uint256 marketSeason
    ) external view returns (uint256);
}
