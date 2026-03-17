// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TOKEN_A is ERC20 {
    constructor() ERC20("Token A", "TOKEN_A") {
        _mint(msg.sender, 1e30);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
