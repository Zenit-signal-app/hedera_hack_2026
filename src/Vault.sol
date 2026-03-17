// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Vault
 * @dev A configurable vault that manages deposits, withdrawals, and manager operations
 * based on manual state transitions. Only token1 can be deposited.
 */
contract Vault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum VaultState {
        Closed,
        Deposit,
        Running,
        Withdraw
    }

    // ============ Events ============

    event Deposited(address indexed shareholder, uint256 amount, uint256 shares);
    event Withdrawn(address indexed shareholder, uint256 amount, uint256 shares);
    event ManagerCall(address indexed target, bytes data);
    event TokenApproved(address indexed token, address indexed spender, uint256 amount);
    event UserWithdrawn(address indexed shareholder, uint256 amount, uint256 shares);
    event StateChanged(VaultState indexed from, VaultState indexed to);
    event TargetAllowed(address indexed target);
    event TargetRemoved(address indexed target);
    event DepositsClosed();
    event VaultUpdated(address indexed token1, address indexed token2, uint256 maxShareholders);
    event VaultClosed();

    // ============ Custom Errors ============

    error Vault__ZeroAddress();
    error Vault__SameTokens();
    error Vault__ZeroMaxShareholders();
    error Vault__ZeroAmount();
    error Vault__DepositsClosed();
    error Vault__NotManager();
    error Vault__NotOwnerOrManager();
    error Vault__InvalidState();
    error Vault__InvalidStateTransition();
    error Vault__MaxShareholdersReached();
    error Vault__VaultMustBeClosedOrEmpty();
    error Vault__NoSharesToWithdraw();
    error Vault__NoShareholdersSpecified();
    error Vault__CallFailed();
    error Vault__InvalidTarget();
    error Vault__TargetNotAllowed();
    error Vault__TargetAlreadyAllowed();
    error Vault__TargetNotInList();
    error Vault__InvalidRecipient();
    error Vault__CannotRecoverVaultToken();
    error Vault__InvalidTokenForApproval();

    // ============ State Variables ============

    /// @notice The token that can be deposited into the vault
    IERC20 public token1;

    /// @notice The second token (available for manager operations)
    IERC20 public token2;

    /// @notice Maximum number of shareholders allowed
    uint256 public maxShareholders;

    /// @notice Snapshot of total token1 balance at the start of withdrawal phase
    uint256 public withdrawalSnapshotBalance;

    /// @notice Snapshot of total shares at the start of withdrawal phase
    uint256 public withdrawalSnapshotShares;

    /// @notice Total shares issued
    uint256 public totalShares;

    /// @notice Current vault phase
    VaultState public state;

    /// @notice Manager address that can call any address
    address public manager;

    /// @notice Whether deposits are closed (packed with vaultClosed into same slot)
    bool public depositsClosed;

    /// @notice Mapping of shareholder address to their share amount
    mapping(address => uint256) public shares;

    /// @notice Mapping of shareholder to index in shareholders array (plus one)
    mapping(address => uint256) private shareholderIndexPlusOne;

    /// @notice Whitelisted targets that manager can call via execute
    mapping(address => bool) public allowedTargets;

    /// @notice Array of all shareholders
    address[] public shareholders;

    // ============ Modifiers ============

    modifier onlyState(VaultState expectedState) {
        _onlyState(expectedState);
        _;
    }

    modifier onlyDepositOrWithdraw() {
        _onlyDepositOrWithdraw();
        _;
    }

    modifier onlyOwnerOrManager() {
        _onlyOwnerOrManager();
        _;
    }

    modifier onlyManager() {
        _onlyManager();
        _;
    }

    modifier notMaxShareholders() {
        _notMaxShareholders();
        _;
    }

    modifier onlyWhenClosedOrNoShareholders() {
        _onlyWhenClosedOrNoShareholders();
        _;
    }

    // ============ Internal Modifier Helpers (reduces bytecode via single JUMP) ============

    function _onlyState(VaultState expectedState) internal view {
        if (state != expectedState) revert Vault__InvalidState();
    }

    function _onlyDepositOrWithdraw() internal view {
        if (state != VaultState.Deposit && state != VaultState.Withdraw) {
            revert Vault__InvalidState();
        }
    }

    function _onlyOwnerOrManager() internal view {
        if (msg.sender != owner() && msg.sender != manager) {
            revert Vault__NotOwnerOrManager();
        }
    }

    function _onlyManager() internal view {
        if (msg.sender != manager) revert Vault__NotManager();
    }

    function _notMaxShareholders() internal view {
        if (shareholders.length >= maxShareholders) {
            revert Vault__MaxShareholdersReached();
        }
    }

    function _onlyWhenClosedOrNoShareholders() internal view {
        if (state != VaultState.Closed && shareholders.length != 0) {
            revert Vault__VaultMustBeClosedOrEmpty();
        }
    }

    function _closeVault() internal {
        VaultState fromState = state;
        state = VaultState.Closed;
        depositsClosed = false;
        withdrawalSnapshotBalance = 0;
        withdrawalSnapshotShares = 0;
        emit StateChanged(fromState, VaultState.Closed);
        emit VaultClosed();
    }

    function _removeShareholder(address shareholder) internal {
        uint256 idxPlusOne = shareholderIndexPlusOne[shareholder];
        if (idxPlusOne == 0) return;

        uint256 index = idxPlusOne - 1;
        uint256 lastIndex = shareholders.length - 1;

        if (index != lastIndex) {
            address lastShareholder = shareholders[lastIndex];
            shareholders[index] = lastShareholder;
            shareholderIndexPlusOne[lastShareholder] = idxPlusOne;
        }

        shareholders.pop();
        delete shareholderIndexPlusOne[shareholder];
    }

    // ============ Constructor ============

    /**
     * @notice Initialize the vault with configuration parameters
     * @param _token1 The ERC20 token that can be deposited into the vault
     * @param _token2 The second ERC20 token (available for manager operations)
     * @param _maxShareholders Maximum number of shareholders allowed
     * @param _manager Address that can call any address
     */
    constructor(address _token1, address _token2, uint256 _maxShareholders, address _manager) Ownable(msg.sender) {
        if (_token1 == address(0)) revert Vault__ZeroAddress();
        if (_token2 == address(0)) revert Vault__ZeroAddress();
        if (_token1 == _token2) revert Vault__SameTokens();
        if (_maxShareholders == 0) revert Vault__ZeroMaxShareholders();
        if (_manager == address(0)) revert Vault__ZeroAddress();

        token1 = IERC20(_token1);
        token2 = IERC20(_token2);
        maxShareholders = _maxShareholders;
        manager = _manager;
        state = VaultState.Closed;
    }

    function stateToDeposit() external onlyOwnerOrManager {
        if (state != VaultState.Closed) revert Vault__InvalidStateTransition();

        state = VaultState.Deposit;
        depositsClosed = false;
        emit StateChanged(VaultState.Closed, VaultState.Deposit);
    }

    function stateToRunning() external onlyOwnerOrManager {
        if (state != VaultState.Deposit) revert Vault__InvalidStateTransition();

        state = VaultState.Running;
        emit StateChanged(VaultState.Deposit, VaultState.Running);
    }

    function stateToWithdraw() external onlyOwnerOrManager {
        if (state != VaultState.Running) revert Vault__InvalidStateTransition();
        if (totalShares == 0) revert Vault__NoSharesToWithdraw();

        state = VaultState.Withdraw;
        withdrawalSnapshotBalance = token1.balanceOf(address(this));
        withdrawalSnapshotShares = totalShares;
        emit StateChanged(VaultState.Running, VaultState.Withdraw);
    }

    function addAllowedTarget(address target) external onlyOwner {
        if (target == address(0)) revert Vault__InvalidTarget();
        if (target == address(token1) || target == address(token2)) {
            revert Vault__InvalidTarget();
        }
        if (allowedTargets[target]) revert Vault__TargetAlreadyAllowed();

        allowedTargets[target] = true;
        emit TargetAllowed(target);
    }

    function removeAllowedTarget(address target) external onlyOwner {
        if (!allowedTargets[target]) revert Vault__TargetNotInList();

        allowedTargets[target] = false;
        emit TargetRemoved(target);
    }

    function closeDeposits() external onlyOwnerOrManager {
        if (!depositsClosed && state == VaultState.Deposit) {
            depositsClosed = true;
            emit DepositsClosed();
        }
    }

    // ============ External Functions ============

    /**
     * @notice Deposit token1 into the vault (only in Deposit state)
     * @param amount Amount of token1 to deposit
     */
    function deposit(uint256 amount) external onlyState(VaultState.Deposit) notMaxShareholders nonReentrant {
        if (amount == 0) revert Vault__ZeroAmount();
        if (depositsClosed) revert Vault__DepositsClosed();

        token1.safeTransferFrom(msg.sender, address(this), amount);

        // shares are 1:1 with deposited token1 amount
        totalShares += amount;

        if (shares[msg.sender] == 0) {
            shareholderIndexPlusOne[msg.sender] = shareholders.length + 1;
            shareholders.push(msg.sender);
        }
        shares[msg.sender] += amount;

        emit Deposited(msg.sender, amount, amount);

        // Close deposits once the shareholder cap is reached
        if (shareholders.length >= maxShareholders) {
            depositsClosed = true;
            emit DepositsClosed();
        }
    }

    /**
     * @notice Withdraw token1 from the vault to a batch of shareholders (only manager, only in Withdraw state)
     * @dev Manager can call this multiple times with different batches to avoid gas limits.
     *      The first call snapshots the total balance and shares; subsequent calls use the same snapshot
     *      to ensure fair proportional distribution. The vault closes when all shares are distributed.
     * @param shareholdersToWithdraw Array of shareholder addresses to process in this batch
     */
    function withdraw(address[] calldata shareholdersToWithdraw)
        external
        onlyState(VaultState.Withdraw)
        onlyManager
        nonReentrant
    {
        if (totalShares == 0) revert Vault__NoSharesToWithdraw();
        if (shareholdersToWithdraw.length == 0) {
            revert Vault__NoShareholdersSpecified();
        }

        if (withdrawalSnapshotShares == 0) revert Vault__NoSharesToWithdraw();

        uint256 snapshotBalance = withdrawalSnapshotBalance;
        uint256 snapshotShares = withdrawalSnapshotShares;

        // Process each shareholder in the batch
        uint256 len = shareholdersToWithdraw.length;
        address lastProcessed;
        for (uint256 i = 0; i < len;) {
            address shareholder = shareholdersToWithdraw[i];
            uint256 userShares = shares[shareholder];

            if (userShares > 0) {
                // Calculate withdrawal amount based on snapshot ratio
                uint256 withdrawalAmount = (userShares * snapshotBalance) / snapshotShares;

                // Effects: clear shares before transfer (CEI)
                shares[shareholder] = 0;
                totalShares -= userShares;
                _removeShareholder(shareholder);

                // Interactions: transfer token1 to shareholder
                if (withdrawalAmount > 0) {
                    token1.safeTransfer(shareholder, withdrawalAmount);
                }

                emit Withdrawn(shareholder, withdrawalAmount, userShares);
                // remember last processed beneficiary (used to sweep rounding dust)
                lastProcessed = shareholder;
            }

            unchecked {
                ++i;
            }
        }

        // If all shares have been distributed, sweep any rounding dust to the
        // last processed shareholder (if any) and then close the vault. Using
        // the contract's current token1 balance after transfers yields the
        // rounding remainder (if any) because `withdrawalSnapshotBalance` was
        // captured at `stateToWithdraw()` and only withdrawals reduce the
        // contract balance during the Withdraw phase.
        if (totalShares == 0) {
            if (lastProcessed != address(0)) {
                uint256 remaining = token1.balanceOf(address(this));
                if (remaining > 0) {
                    token1.safeTransfer(lastProcessed, remaining);
                    emit Withdrawn(lastProcessed, remaining, 0);
                }
            }

            _closeVault();
        }
    }

    function userWithdraw() external onlyDepositOrWithdraw nonReentrant {
        uint256 userShares = shares[msg.sender];
        if (userShares == 0) revert Vault__NoSharesToWithdraw();

        shares[msg.sender] = 0;
        totalShares -= userShares;
        _removeShareholder(msg.sender);

        uint256 withdrawalAmount = userShares;

        if (state == VaultState.Withdraw) {
            if (withdrawalSnapshotShares == 0) {
                revert Vault__NoSharesToWithdraw();
            }
            withdrawalAmount = (userShares * withdrawalSnapshotBalance) / withdrawalSnapshotShares;
        }

        if (withdrawalAmount > 0) {
            token1.safeTransfer(msg.sender, withdrawalAmount);
        }

        if (state == VaultState.Deposit && shareholders.length < maxShareholders) {
            depositsClosed = false;
        }

        emit UserWithdrawn(msg.sender, withdrawalAmount, userShares);

        // If this call completed the final withdrawal round, sweep any
        // residual rounding dust to the caller (they are the last
        // withdrawer) and close the vault.
        if (state == VaultState.Withdraw && totalShares == 0) {
            uint256 remaining = token1.balanceOf(address(this));
            if (remaining > 0) {
                token1.safeTransfer(msg.sender, remaining);
                emit UserWithdrawn(msg.sender, remaining, 0);
            }

            _closeVault();
        }
    }

    /**
     * @notice Update vault configuration (only manager)
     * @param _token1 New token1 address
     * @param _token2 New token2 address
     * @param _maxShareholders New maximum shareholders
     */
    function updateVault(address _token1, address _token2, uint256 _maxShareholders)
        external
        onlyOwnerOrManager
        onlyWhenClosedOrNoShareholders
    {
        if (_token1 == address(0)) revert Vault__ZeroAddress();
        if (_token2 == address(0)) revert Vault__ZeroAddress();
        if (_token1 == _token2) revert Vault__SameTokens();
        if (_maxShareholders == 0) revert Vault__ZeroMaxShareholders();

        VaultState fromState = state;
        token1 = IERC20(_token1);
        token2 = IERC20(_token2);
        maxShareholders = _maxShareholders;

        // Reset vault state to allow new operations
        state = VaultState.Closed;
        depositsClosed = false;
        withdrawalSnapshotBalance = 0;
        withdrawalSnapshotShares = 0;

        if (shareholders.length == 0) {
            delete shareholders;
        }

        if (fromState != VaultState.Closed) {
            emit StateChanged(fromState, VaultState.Closed);
        }

        emit VaultUpdated(_token1, _token2, _maxShareholders);
    }

    /**
     * @notice Manager can call any address (only in Running state)
     * @dev Target cannot be token1 or token2 to prevent direct manipulation of vault balances.
     * @param target Address to call
     * @param data Calldata to send to target
     * @return result Return data from the call
     */
    function execute(address target, bytes calldata data)
        external
        onlyManager
        onlyState(VaultState.Running)
        nonReentrant
        returns (bytes memory result)
    {
        if (target == address(0)) revert Vault__InvalidTarget();
        if (target == address(this)) revert Vault__InvalidTarget();
        if (!allowedTargets[target]) revert Vault__TargetNotAllowed();

        (bool success, bytes memory returnData) = target.call(data);
        if (!success) revert Vault__CallFailed();

        emit ManagerCall(target, data);
        return returnData;
    }

    /**
     * @notice Approve a spender (e.g., DEX router) to spend vault's tokens
     * @dev Only allows approving token1 or token2. This is separated from execute()
     *      because execute() blocks direct calls to token contracts for safety.
     *      The manager needs this to approve DEX routers before swapping.
     * @param token The token to approve (must be token1 or token2)
     * @param spender The address to approve (e.g., DEX router)
     * @param amount The amount to approve
     */
    function approveToken(address token, address spender, uint256 amount)
        external
        onlyManager
        onlyState(VaultState.Running)
    {
        if (token != address(token1) && token != address(token2)) {
            revert Vault__InvalidTokenForApproval();
        }
        if (spender == address(0)) revert Vault__ZeroAddress();

        IERC20 erc = IERC20(token);
        // ERC20.approve should be used with care. To support tokens
        // that require resetting allowance to zero before setting a new value,
        // zero it first when necessary.
        uint256 current = erc.allowance(address(this), spender);
        if (current != 0) {
            erc.approve(spender, 0);
        }
        erc.approve(spender, amount);

        emit TokenApproved(token, spender, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get the number of shareholders
     * @return Number of shareholders
     */
    function getShareholderCount() external view returns (uint256) {
        return shareholders.length;
    }

    /**
     * @notice Get all shareholders
     * @return Array of shareholder addresses
     */
    function getShareholders() external view returns (address[] memory) {
        return shareholders;
    }

    /**
     * @notice Get current vault state
     * @return _totalShares Total shares issued
     * @return _totalBalance Total token1 balance
     * @return _shareholderCount Number of shareholders
     * @return _depositsClosed Whether deposits are closed
     * @return _state Current vault phase
     */
    function getVaultState()
        external
        view
        returns (
            uint256 _totalShares,
            uint256 _totalBalance,
            uint256 _shareholderCount,
            bool _depositsClosed,
            VaultState _state
        )
    {
        return (totalShares, token1.balanceOf(address(this)), shareholders.length, depositsClosed, state);
    }

    /**
     * @notice Calculate withdrawal amount for a given share amount (uses live balance, not snapshot)
     * @param shareAmount Amount of shares to calculate for
     * @return withdrawalAmount Amount of token1 that would be withdrawn
     */
    function calculateWithdrawalAmount(uint256 shareAmount) external view returns (uint256 withdrawalAmount) {
        if (totalShares == 0) return 0;
        return (shareAmount * token1.balanceOf(address(this))) / totalShares;
    }

    // ============ Emergency Functions ============

    /**
     * @notice Emergency function to recover stuck tokens (only owner)
     * @param _token Token to recover
     * @param _to Address to send tokens to
     * @param _amount Amount to recover
     */
    function emergencyRecover(address _token, address _to, uint256 _amount) external onlyOwner {
        if (_to == address(0)) revert Vault__InvalidRecipient();
        if (_amount == 0) revert Vault__ZeroAmount();
        if (_token == address(token1) || _token == address(token2)) {
            revert Vault__CannotRecoverVaultToken();
        }

        IERC20(_token).safeTransfer(_to, _amount);
    }
}
