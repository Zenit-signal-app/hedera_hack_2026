// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal Uniswap V2–style router mock: constant product with 0.3% fee per hop (two-token pool).
contract MockV2Router {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    error Expired();
    error InvalidPath();
    error Slippage();

    constructor(address tokenA_, address tokenB_) {
        tokenA = IERC20(tokenA_);
        tokenB = IERC20(tokenB_);
    }

    /// @dev Sync virtual reserves with actual balances (fund router first).
    function syncReservesFromBalances() external {
        reserveA = tokenA.balanceOf(address(this));
        reserveB = tokenB.balanceOf(address(this));
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        if (path.length != 2) revert InvalidPath();
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        if (path[0] == address(tokenA) && path[1] == address(tokenB)) {
            amounts[1] = getAmountOut(amountIn, reserveA, reserveB);
        } else if (path[0] == address(tokenB) && path[1] == address(tokenA)) {
            amounts[1] = getAmountOut(amountIn, reserveB, reserveA);
        } else {
            revert InvalidPath();
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        if (deadline < block.timestamp) revert Expired();
        if (path.length != 2) revert InvalidPath();

        IERC20 tokenIn = IERC20(path[0]);
        IERC20 tokenOut = IERC20(path[1]);

        uint256 amountOut;
        if (path[0] == address(tokenA) && path[1] == address(tokenB)) {
            amountOut = getAmountOut(amountIn, reserveA, reserveB);
            if (amountOut < amountOutMin) revert Slippage();
            reserveA += amountIn;
            reserveB -= amountOut;
        } else if (path[0] == address(tokenB) && path[1] == address(tokenA)) {
            amountOut = getAmountOut(amountIn, reserveB, reserveA);
            if (amountOut < amountOutMin) revert Slippage();
            reserveB += amountIn;
            reserveA -= amountOut;
        } else {
            revert InvalidPath();
        }

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOut.safeTransfer(to, amountOut);
    }
}
