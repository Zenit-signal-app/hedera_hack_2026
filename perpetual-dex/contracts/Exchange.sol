// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "./interface/IAdapter.sol";
import {IExchange} from "./interface/IExchange.sol";

contract Exchange is Ownable, Pausable, ReentrancyGuard, IExchange {
    using SafeERC20 for IERC20;

    struct AdapterConfig {
        address adapter;
        bool active;
    }

    mapping(bytes32 => AdapterConfig) public adapters;

    error AdapterNotActive(bytes32 adapterId);
    error InvalidAddress();
    error InvalidAmount();
    error Expired();
    error SwapTooSmall(uint256 amountOut, uint256 minAmountOut);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAdapter(bytes32 adapterId, address adapter, bool active) external onlyOwner {
        if (adapter == address(0)) revert InvalidAddress();
        adapters[adapterId] = AdapterConfig({adapter: adapter, active: active});
        emit AdapterSet(adapterId, adapter, active);
    }

    function removeAdapter(bytes32 adapterId) external onlyOwner {
        delete adapters[adapterId];
        emit AdapterRemoved(adapterId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc IExchange
    /// @dev Revert `AdapterNotActive` nếu chưa `setAdapter` / `active=false`. Mọi revert khác (pool, path)
    ///      đến từ `IAdapter.quote` — kiểm tra router/quoter trong adapter, không phải lỗi Exchange.
    function quote(SwapParams calldata params) external view returns (uint256 amountOut) {
        AdapterConfig memory cfg = adapters[params.adapterId];
        if (!cfg.active || cfg.adapter == address(0)) revert AdapterNotActive(params.adapterId);

        IAdapter.SwapRequest memory request = IAdapter.SwapRequest({
            payer: msg.sender,
            recipient: params.recipient,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            minAmountOut: 0,
            deadline: params.deadline,
            extraData: params.adapterData
        });

        return IAdapter(cfg.adapter).quote(request);
    }

    function swap(SwapParams calldata params)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 amountOut)
    {
        if (params.amountIn == 0) revert InvalidAmount();
        if (params.recipient == address(0)) revert InvalidAddress();
        if (params.deadline < block.timestamp) revert Expired();

        AdapterConfig memory cfg = adapters[params.adapterId];
        if (!cfg.active || cfg.adapter == address(0)) revert AdapterNotActive(params.adapterId);

        params.tokenIn.safeTransferFrom(msg.sender, cfg.adapter, params.amountIn);

        IAdapter.SwapRequest memory request = IAdapter.SwapRequest({
            payer: msg.sender,
            recipient: params.recipient,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn: params.amountIn,
            minAmountOut: params.minAmountOut,
            deadline: params.deadline,
            extraData: params.adapterData
        });

        amountOut = IAdapter(cfg.adapter).executeSwap{value: msg.value}(request);
        if (amountOut < params.minAmountOut) revert SwapTooSmall(amountOut, params.minAmountOut);

        emit SwapExecuted(
            params.adapterId,
            msg.sender,
            params.recipient,
            address(params.tokenIn),
            address(params.tokenOut),
            params.amountIn,
            amountOut
        );
    }
}
