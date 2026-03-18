// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IHederaTokenService {
    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) external returns (int256 responseCode);

    function transferTokens(
        address token,
        address[] calldata sender,
        address[] calldata receiver,
        int64[] calldata amount
    ) external returns (int256 responseCode);

    function approve(
        address token,
        address spender,
        int64 amount
    ) external returns (int256 responseCode);

    function transferFrom(
        address token,
        address from,
        address to,
        int64 amount
    ) external returns (int256 responseCode);

    function associateToken(
        address account,
        address token
    ) external returns (int256 responseCode);

    function dissociateToken(
        address account,
        address token
    ) external returns (int256 responseCode);

    function getAccountTokenBalance(
        address account,
        address token
    ) external view returns (int256 responseCode, uint256 balance);
}

contract Vault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address private constant HTS = address(0x167);
    int256 private constant HTS_SUCCESS = 22;

    enum VaultState {
        Closed,
        Deposit,
        Running,
        Withdraw
    }

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
    error Vault__HtsTransferFailed();
    error Vault__HtsApprovalFailed();
    error Vault__HtsTransferFromFailed();
    error Vault__TokenNotAssociated();

    IERC20 public token1;
    IERC20 public token2;
    uint256 public maxShareholders;
    uint256 public withdrawalSnapshotBalance;
    uint256 public withdrawalSnapshotShares;
    uint256 public totalShares;
    VaultState public state;
    address public manager;
    bool public depositsClosed;
    mapping(address => uint256) public shares;
    mapping(address => uint256) private shareholderIndexPlusOne;
    mapping(address => bool) public allowedTargets;
    address[] public shareholders;

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

    function _isHts(address token) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(token)
        }
        return size == 0;
    }

    function _htsSafeTransfer(address token, address to, uint256 amount) internal {
        int256 response = IHederaTokenService(HTS).transferToken(
            token,
            address(this),
            to,
            // HTS requires int64 - amount is guaranteed to fit for token transfers
            int64(uint64(amount))
        );
        if (response != HTS_SUCCESS) revert Vault__HtsTransferFailed();
    }

    function _htsSafeTransferFrom(address token, address from, address to, uint256 amount) internal {
        int256 response = IHederaTokenService(HTS).transferFrom(
            token,
            from,
            to,
            // HTS requires int64 - amount is guaranteed to fit for token transfers
            int64(uint64(amount))
        );
        if (response != HTS_SUCCESS) revert Vault__HtsTransferFromFailed();
    }

    function _htsSafeApprove(address token, address spender, uint256 amount) internal {
        int256 response = IHederaTokenService(HTS).approve(
            token,
            spender,
            // HTS requires int64 - amount is guaranteed to fit for token transfers
            int64(uint64(amount))
        );
        if (response != HTS_SUCCESS) revert Vault__HtsApprovalFailed();
    }

    function _htsGetBalance(address token, address account) internal view returns (uint256) {
        (, uint256 balance) = IHederaTokenService(HTS).getAccountTokenBalance(account, token);
        return balance;
    }

    function _checkAssociation(address token, address account) internal view {
        uint256 balance = _htsGetBalance(token, account);
        if (balance == 0 && _isHts(token)) {
            uint256 erc20Balance = IERC20(token).balanceOf(account);
            if (erc20Balance == 0) {
                revert Vault__TokenNotAssociated();
            }
        }
    }

    function _safeTransferToken(address token, address to, uint256 amount) internal {
        if (_isHts(token)) {
            _htsSafeTransfer(token, to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _safeTransferFromToken(address token, address from, address to, uint256 amount) internal {
        if (_isHts(token)) {
            _htsSafeTransferFrom(token, from, to, amount);
        } else {
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    function _safeApproveToken(address token, address spender, uint256 amount) internal {
        if (_isHts(token)) {
            if (amount == 0) {
                _htsSafeApprove(token, spender, 0);
            } else {
                _htsSafeApprove(token, spender, amount);
            }
        } else {
            IERC20 erc = IERC20(token);
            uint256 current = erc.allowance(address(this), spender);
            if (current != 0) {
                erc.approve(spender, 0);
            }
            erc.approve(spender, amount);
        }
    }

    function _getTokenBalance(address token) internal view returns (uint256) {
        if (_isHts(token)) {
            return _htsGetBalance(token, address(this));
        } else {
            return IERC20(token).balanceOf(address(this));
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
        withdrawalSnapshotBalance = _getTokenBalance(address(token1));
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

    function deposit(uint256 amount) external onlyState(VaultState.Deposit) notMaxShareholders nonReentrant {
        if (amount == 0) revert Vault__ZeroAmount();
        if (depositsClosed) revert Vault__DepositsClosed();

        _safeTransferFromToken(address(token1), msg.sender, address(this), amount);

        totalShares += amount;

        if (shares[msg.sender] == 0) {
            shareholderIndexPlusOne[msg.sender] = shareholders.length + 1;
            shareholders.push(msg.sender);
        }
        shares[msg.sender] += amount;

        emit Deposited(msg.sender, amount, amount);

        if (shareholders.length >= maxShareholders) {
            depositsClosed = true;
            emit DepositsClosed();
        }
    }

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

        uint256 len = shareholdersToWithdraw.length;
        address lastProcessed;
        for (uint256 i = 0; i < len;) {
            address shareholder = shareholdersToWithdraw[i];
            uint256 userShares = shares[shareholder];

            if (userShares > 0) {
                uint256 withdrawalAmount = (userShares * snapshotBalance) / snapshotShares;

                shares[shareholder] = 0;
                totalShares -= userShares;
                _removeShareholder(shareholder);

                if (withdrawalAmount > 0) {
                    _safeTransferToken(address(token1), shareholder, withdrawalAmount);
                }

                emit Withdrawn(shareholder, withdrawalAmount, userShares);
                lastProcessed = shareholder;
            }

            unchecked {
                ++i;
            }
        }

        if (totalShares == 0) {
            if (lastProcessed != address(0)) {
                uint256 remaining = _getTokenBalance(address(token1));
                if (remaining > 0) {
                    _safeTransferToken(address(token1), lastProcessed, remaining);
                    emit Withdrawn(lastProcessed, remaining, 0);
                }
            }

            _closeVault();
        }
    }

    function userWithdraw() external onlyDepositOrWithdraw nonReentrant {
        _checkAssociation(address(token1), msg.sender);

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
            _safeTransferToken(address(token1), msg.sender, withdrawalAmount);
        }

        if (state == VaultState.Deposit && shareholders.length < maxShareholders) {
            depositsClosed = false;
        }

        emit UserWithdrawn(msg.sender, withdrawalAmount, userShares);

        if (state == VaultState.Withdraw && totalShares == 0) {
            uint256 remaining = _getTokenBalance(address(token1));
            if (remaining > 0) {
                _safeTransferToken(address(token1), msg.sender, remaining);
                emit UserWithdrawn(msg.sender, remaining, 0);
            }

            _closeVault();
        }
    }

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

    function approveToken(address token, address spender, uint256 amount)
        external
        onlyManager
        onlyState(VaultState.Running)
    {
        if (token != address(token1) && token != address(token2)) {
            revert Vault__InvalidTokenForApproval();
        }
        if (spender == address(0)) revert Vault__ZeroAddress();

        _safeApproveToken(token, spender, amount);

        emit TokenApproved(token, spender, amount);
    }

    function getShareholderCount() external view returns (uint256) {
        return shareholders.length;
    }

    function getShareholders() external view returns (address[] memory) {
        return shareholders;
    }

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
        return (totalShares, _getTokenBalance(address(token1)), shareholders.length, depositsClosed, state);
    }

    function calculateWithdrawalAmount(uint256 shareAmount) external view returns (uint256 withdrawalAmount) {
        if (totalShares == 0) return 0;
        return (shareAmount * _getTokenBalance(address(token1))) / totalShares;
    }

    function emergencyRecover(address _token, address _to, uint256 _amount) external onlyOwner {
        if (_to == address(0)) revert Vault__InvalidRecipient();
        if (_amount == 0) revert Vault__ZeroAmount();
        if (_token == address(token1) || _token == address(token2)) {
            revert Vault__CannotRecoverVaultToken();
        }

        _safeTransferToken(_token, _to, _amount);
    }
}
