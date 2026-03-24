// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "../interface/IAdapter.sol";

interface IUniswapV2LikeRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

contract UniswapV2LikeAdapter is Ownable, IAdapter {
    using SafeERC20 for IERC20;

    address public immutable exchange;
    IUniswapV2LikeRouter public immutable router;
    uint16 private _adapterFeeBps;

    error OnlyExchange();
    error InvalidPath();
    error InvalidFeeBps();

    constructor(address initialOwner, address exchange_, address router_, uint16 feeBps_) Ownable(initialOwner) {
        if (exchange_ == address(0) || router_ == address(0)) revert InvalidPath();
        if (feeBps_ > 1_000) revert InvalidFeeBps();
        exchange = exchange_;
        router = IUniswapV2LikeRouter(router_);
        _adapterFeeBps = feeBps_;
    }

    function setAdapterFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > 1_000) revert InvalidFeeBps();
        _adapterFeeBps = feeBps_;
    }

    function adapterFeeBps() external view override returns (uint16) {
        return _adapterFeeBps;
    }

    function quote(SwapRequest calldata request) external view override returns (uint256 amountOut) {
        address[] memory path = request.extraData.length > 0
            ? abi.decode(request.extraData, (address[]))
            : _defaultPath(address(request.tokenIn), address(request.tokenOut));

        if (path.length < 2 || path[0] != address(request.tokenIn) || path[path.length - 1] != address(request.tokenOut)) {
            revert InvalidPath();
        }

        uint256[] memory amounts = router.getAmountsOut(request.amountIn, path);
        return amounts[amounts.length - 1];
    }

    function executeSwap(SwapRequest calldata request) external payable override returns (uint256 amountOut) {
        if (msg.sender != exchange) revert OnlyExchange();

        address[] memory path = request.extraData.length > 0
            ? abi.decode(request.extraData, (address[]))
            : _defaultPath(address(request.tokenIn), address(request.tokenOut));

        if (path.length < 2 || path[0] != address(request.tokenIn) || path[path.length - 1] != address(request.tokenOut)) {
            revert InvalidPath();
        }

        request.tokenIn.forceApprove(address(router), 0);
        request.tokenIn.forceApprove(address(router), request.amountIn);

        uint256 beforeOut = request.tokenOut.balanceOf(request.recipient);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            request.amountIn,
            request.minAmountOut,
            path,
            request.recipient,
            request.deadline
        );
        uint256 afterOut = request.tokenOut.balanceOf(request.recipient);
        amountOut = afterOut - beforeOut;
    }

    function _defaultPath(address tokenIn, address tokenOut) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
    }
}
