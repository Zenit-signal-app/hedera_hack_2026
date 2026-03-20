// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Interface for handling positions in Perpetual DEX.
 */
interface IPosition {
    /**
     * Enum for different types of trading positions.
     */
    enum PositionType {
        Long, // Long position
        Short // Short position
    }

    /**
     * Struct to represent a trading position.
     * @param amount The amount involved in the position.
     * @param position The type of the position (Long/Short).
     * @param leverage The leverage applied to the position.
     */
    struct Position {
        uint256 amount;
        PositionType position;
        uint8 leverage;
        uint256 entryPriceE18;
    }

    /**
     * Emitted when a position is opened.
     * @param user The address of the user.
     * @param market The market symbol (bytes32, e.g. "BTCUSD").
     * @param amount The amount involved in the position.
     * @param position The type of the opened position.
     * @param leverage The leverage applied to the position.
     */
    event PositionOpened(
        address indexed user,
        bytes32 indexed market,
        uint256 amount,
        PositionType position,
        uint8 leverage
    );

    /**
     * Emitted when a position is increased.
     * @param user The address of the user.
     * @param market The market symbol.
     * @param amount The additional amount added to the position.
     */
    event PositionIncreased(address indexed user, bytes32 indexed market, uint256 amount);

    /**
     * Emitted when a position is closed.
     * @param user The address of the user.
     * @param market The market symbol.
     * @param amount The amount of the position being closed.
     */
    event PositionClosed(address indexed user, bytes32 indexed market, uint256 amount, int256 pnl);

    event PositionLiquidated(address indexed user, bytes32 indexed market, uint256 amount, int256 pnl);

    /**
     * Opens a new trading position for a market.
     * @param _market The market symbol (bytes32, e.g. "BTCUSD").
     * @param _amount The amount for the new position.
     * @param _position The type of the position (Long/Short).
     * @param _leverage The leverage for the new position.
     */
    function openPosition(
        bytes32 _market,
        uint256 _amount,
        PositionType _position,
        uint8 _leverage
    ) external;

    /**
     * Increases an existing trading position.
     * @param _market The market symbol.
     * @param _amount The additional amount to increase the position by.
     */
    function increasePosition(bytes32 _market, uint256 _amount) external;

    /**
     * Closes an existing trading position.
     * @param _market The market symbol.
     * @param _amount The amount of the position to be closed.
     */
    function closePosition(bytes32 _market, uint256 _amount) external;

    /**
     * Retrieves the current position for a specified user and market.
     * @param user The address of the user.
     * @param market The market symbol.
     * @return Position The current position of the user for that market.
     */
    function getCurrentPosition(
        address user,
        bytes32 market
    ) external view returns (Position memory);
}

/**
 * @title Interface for a Perpetual DEX.
 */
interface IPerpDEX {
    /**
     * Emitted when a user makes a deposit.
     * @param user The address of the user.
     * @param amount The amount deposited.
     */
    event Deposit(address indexed user, uint256 amount);

    /**
     * Emitted when a user makes a withdrawal.
     * @param user The address of the user.
     * @param amount The amount withdrawn.
     */
    event Withdraw(address indexed user, uint256 amount);

    /**
     * Allows a user to deposit a specified amount.
     * @param _amount The amount to be deposited.
     */
    function deposit(uint256 _amount) external;

    /**
     * @notice Keeper-assisted sync deposit for HTS one-click flow.
     *         User first transfers HTS token to DEX account, then keeper calls this.
     */
    function depositFor(address _user, uint256 _amount) external;

    /**
     * Allows a user to withdraw a specified amount.
     * @param _amount The amount to be withdrawn.
     */
    function withdraw(uint256 _amount) external;

    /**
     * Retrieves the token address associated with positions.
     * @return address The address of the token.
     */
    function getTokenAddress() external view returns (address);

    /**
     * Retrieves the address of the reward contract.
     * @return address The address of the reward contract.
     */
    function getRewardContractAddress() external view returns (address);

    /**
     * Retrieves the balance of a specified account.
     * @param _account The address of the account.
     * @return uint256 The balance of the account.
     */
    function balanceOf(address _account) external view returns (uint256);
}
