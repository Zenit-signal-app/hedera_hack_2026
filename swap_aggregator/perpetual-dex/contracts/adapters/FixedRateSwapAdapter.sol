// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "../interface/IAdapter.sol";

/// @notice Second-venue style adapter: fixed exchange rate (e.g. stable / oracle-pegged pool abstraction).
/// @dev Fund this contract with `tokenOut` before users swap. `tokenIn` accumulates here; owner can sweep.
contract FixedRateSwapAdapter is Ownable, IAdapter {
    using SafeERC20 for IERC20;

    address public immutable exchange;
    uint16 private _adapterFeeBps;

    IERC20 public immutable tokenIn;
    IERC20 public immutable tokenOut;
    uint256 public immutable rateNumerator;
    uint256 public immutable rateDenominator;

    error OnlyExchange();
    error InvalidFeeBps();
    error PairMismatch();
    error InsufficientLiquidity();

    constructor(
        address initialOwner,
        address exchange_,
        IERC20 tokenIn_,
        IERC20 tokenOut_,
        uint256 rateNumerator_,
        uint256 rateDenominator_,
        uint16 feeBps_
    ) Ownable(initialOwner) {
        if (exchange_ == address(0)) revert PairMismatch();
        if (rateDenominator_ == 0) revert PairMismatch();
        if (feeBps_ > 1_000) revert InvalidFeeBps();
        exchange = exchange_;
        tokenIn = tokenIn_;
        tokenOut = tokenOut_;
        rateNumerator = rateNumerator_;
        rateDenominator = rateDenominator_;
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
        _validatePair(request);
        return _quoteAmount(request.amountIn);
    }

    function executeSwap(SwapRequest calldata request) external payable override returns (uint256 amountOut) {
        if (msg.sender != exchange) revert OnlyExchange();
        _validatePair(request);

        amountOut = _quoteAmount(request.amountIn);
        if (tokenOut.balanceOf(address(this)) < amountOut) revert InsufficientLiquidity();

        tokenOut.safeTransfer(request.recipient, amountOut);
    }

    function sweepTokenIn(address to, uint256 amount) external onlyOwner {
        tokenIn.safeTransfer(to, amount);
    }

    function sweepTokenOut(address to, uint256 amount) external onlyOwner {
        tokenOut.safeTransfer(to, amount);
    }

    function _validatePair(SwapRequest calldata request) private view {
        if (address(request.tokenIn) != address(tokenIn) || address(request.tokenOut) != address(tokenOut)) {
            revert PairMismatch();
        }
    }

    function _quoteAmount(uint256 amountIn) private view returns (uint256) {
        return (amountIn * rateNumerator) / rateDenominator;
    }
}
