// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IExchange {
    struct SwapParams {
        bytes32 adapterId;
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        uint256 deadline;
        bytes adapterData;
    }

    event AdapterSet(bytes32 indexed adapterId, address indexed adapter, bool active);
    event AdapterRemoved(bytes32 indexed adapterId);
    event SwapExecuted(
        bytes32 indexed adapterId,
        address indexed sender,
        address indexed recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    function swap(SwapParams calldata params) external payable returns (uint256 amountOut);

    /// @notice View-only quote routed to the active adapter for `params.adapterId`.
    function quote(SwapParams calldata params) external view returns (uint256 amountOut);
}
