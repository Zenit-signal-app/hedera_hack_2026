// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZenitOracle
 * @notice Minimal on-chain oracle updated by an authorized updater (keeper).
 *         Prices are stored as 1e18-scaled USD values.
 */
contract ZenitOracle is Ownable {
    mapping(bytes32 => uint256) public pricesE18;
    address public updater;

    event UpdaterSet(address indexed updater);
    event PriceUpdated(bytes32 indexed market, uint256 priceE18);
    event PricesUpdated(uint256 count);

    constructor() Ownable(msg.sender) {}

    function setUpdater(address _updater) external onlyOwner {
        updater = _updater;
        emit UpdaterSet(_updater);
    }

    function setPrice(bytes32 market, uint256 priceE18) external {
        require(msg.sender == updater, "Only updater");
        require(priceE18 > 0, "Invalid price");
        pricesE18[market] = priceE18;
        emit PriceUpdated(market, priceE18);
    }

    function setPrices(bytes32[] calldata markets, uint256[] calldata prices) external {
        require(msg.sender == updater, "Only updater");
        require(markets.length == prices.length, "Length mismatch");
        for (uint256 i = 0; i < markets.length; i++) {
            uint256 p = prices[i];
            require(p > 0, "Invalid price");
            pricesE18[markets[i]] = p;
            emit PriceUpdated(markets[i], p);
        }
        emit PricesUpdated(markets.length);
    }

    function getPrice(bytes32 market) external view returns (uint256) {
        return pricesE18[market];
    }
}

