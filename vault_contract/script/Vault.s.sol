// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {Vault} from "src/Vault.sol";
import {VaultConfig} from "src/VaultConfig.sol";

contract VaultScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("OPERATOR_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        Vault vault = new Vault(
            VaultConfig.TOKEN1,
            VaultConfig.TOKEN2,
            VaultConfig.MAX_SHAREHOLDERS,
            deployer
        );
        console.log("Vault deployed to:", address(vault));
        console.log("Token1 address:", VaultConfig.TOKEN1);
        console.log("Token2 address:", VaultConfig.TOKEN2);
        console.log("Max shareholders:", VaultConfig.MAX_SHAREHOLDERS);
        console.log("Manager address:", deployer);

        vm.stopBroadcast();
    }
}
