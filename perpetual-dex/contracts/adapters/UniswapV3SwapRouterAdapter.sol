// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "../interface/IAdapter.sol";
import {V3Path} from "../libraries/V3Path.sol";

/// @notice SaucerSwap V2 / Uniswap V3–style **SwapRouter** (`exactInput`) + QuoterV2 cho `quote`.
/// @dev `extraData` = `abi.encode(bytes path)` — path packed: token|fee|token|…
interface ISwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

interface IQuoterV2 {
    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (
            uint256 amountOut,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        );
}

contract UniswapV3SwapRouterAdapter is Ownable, IAdapter {
    using SafeERC20 for IERC20;

    address public immutable exchange;
    ISwapRouter public immutable swapRouter;
    address public immutable quoter;
    uint16 private _adapterFeeBps;

    error OnlyExchange();
    error InvalidPath();
    error InvalidFeeBps();
    error QuoterCallFailed();

    constructor(address initialOwner, address exchange_, address swapRouter_, address quoter_, uint16 feeBps_) Ownable(initialOwner) {
        if (exchange_ == address(0) || swapRouter_ == address(0) || quoter_ == address(0)) revert InvalidPath();
        if (feeBps_ > 1_000) revert InvalidFeeBps();
        exchange = exchange_;
        swapRouter = ISwapRouter(swapRouter_);
        quoter = quoter_;
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
        bytes memory path = abi.decode(request.extraData, (bytes));
        if (path.length < 43) revert InvalidPath();
        if (V3Path.firstToken(path) != address(request.tokenIn) || V3Path.lastToken(path) != address(request.tokenOut)) {
            revert InvalidPath();
        }
        (bool ok, bytes memory ret) = quoter.staticcall(
            abi.encodeWithSignature("quoteExactInput(bytes,uint256)", path, request.amountIn)
        );
        if (!ok || ret.length < 32) revert QuoterCallFailed();
        (amountOut,,,) = abi.decode(ret, (uint256, uint160[], uint32[], uint256));
    }

    function executeSwap(SwapRequest calldata request) external payable override returns (uint256 amountOut) {
        if (msg.sender != exchange) revert OnlyExchange();
        bytes memory path = abi.decode(request.extraData, (bytes));
        if (path.length < 43) revert InvalidPath();
        if (V3Path.firstToken(path) != address(request.tokenIn) || V3Path.lastToken(path) != address(request.tokenOut)) {
            revert InvalidPath();
        }

        IERC20 tokenIn = request.tokenIn;
        IERC20 tokenOut = request.tokenOut;

        tokenIn.forceApprove(address(swapRouter), 0);
        tokenIn.forceApprove(address(swapRouter), request.amountIn);

        uint256 beforeBal = tokenOut.balanceOf(request.recipient);
        swapRouter.exactInput(
            ISwapRouter.ExactInputParams({
                path: path,
                recipient: request.recipient,
                deadline: request.deadline,
                amountIn: request.amountIn,
                amountOutMinimum: request.minAmountOut
            })
        );
        uint256 afterBal = tokenOut.balanceOf(request.recipient);
        amountOut = afterBal - beforeBal;
    }
}
