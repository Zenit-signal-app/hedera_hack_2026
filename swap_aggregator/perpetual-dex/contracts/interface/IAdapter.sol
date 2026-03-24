// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAdapter {
    struct SwapRequest {
        address payer;
        address recipient;
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        bytes extraData;
    }

    /// @notice Optional adapter fee for UI/analytics (in bps).
    function adapterFeeBps() external view returns (uint16);

    /// @notice Expected output for a hypothetical swap (no state change). Used by UIs / off-chain bridges.
    /// @dev Implementations may revert if routing cannot be resolved (e.g. missing pool).
    function quote(SwapRequest calldata request) external view returns (uint256 amountOut);

    /// @notice Execute swap with funds already moved to this adapter.
    function executeSwap(SwapRequest calldata request) external payable returns (uint256 amountOut);
}
