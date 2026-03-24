// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract zUSDC is ERC20, ERC20Permit {
    constructor() ERC20("zUSDC", "zUSDC") ERC20Permit("zUSDC") {
        _mint(msg.sender, 500_000_000 * 10 ** decimals());
    }
}
