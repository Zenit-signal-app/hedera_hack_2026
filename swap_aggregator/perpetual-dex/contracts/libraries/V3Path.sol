// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @dev Packed path: `token (20) | fee (3) | token (20) | ...` — Uniswap V3 / SaucerSwap V2.
library V3Path {
    error PathTooShort();

    function firstToken(bytes memory path) internal pure returns (address token) {
        if (path.length < 20) revert PathTooShort();
        assembly {
            token := shr(96, mload(add(path, 0x20)))
        }
    }

    function lastToken(bytes memory path) internal pure returns (address token) {
        if (path.length < 20) revert PathTooShort();
        assembly {
            let len := mload(path)
            let data := add(path, 0x20)
            token := shr(96, mload(add(data, sub(len, 20))))
        }
    }
}
