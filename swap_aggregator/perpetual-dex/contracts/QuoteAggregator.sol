// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IExchange} from "./interface/IExchange.sol";

/// @notice Thin on-chain “bridge” for quoting: same math as `Exchange.quote`, stable ABI for frontends / indexers.
contract QuoteAggregator {
    IExchange public immutable exchange;

    constructor(address exchange_) {
        exchange = IExchange(exchange_);
    }

    function quote(IExchange.SwapParams calldata params) external view returns (uint256 amountOut) {
        return exchange.quote(params);
    }
}
