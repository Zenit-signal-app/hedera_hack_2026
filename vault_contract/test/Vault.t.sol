// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract VaultTest is Test {
    address internal owner = makeAddr("owner");
    address internal manager = makeAddr("manager");
    address internal alith =
        address(0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac);
    address internal baltathar =
        address(0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0);
    address internal charleth =
        address(0x798d4Ba9baf0064Ec19eB4F0a1a45785ae9D6DFc);
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");

    MockERC20 internal token1;
    MockERC20 internal token2;
    MockERC20 internal foreignToken;

    Vault internal vault;

    function setUp() public {
        token1 = new MockERC20("Token1", "TK1");
        token2 = new MockERC20("Token2", "TK2");
        foreignToken = new MockERC20("Foreign", "FOR");

        vm.prank(owner);
        vault = new Vault(address(token1), address(token2), 3, manager);

        token1.mint(alith, 1_000 ether);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 1_000 ether);
        token1.mint(owner, 10_000 ether);
        token1.mint(stranger, 1_000 ether);

        vm.prank(alith);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(baltathar);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(carol);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(stranger);
        token1.approve(address(vault), type(uint256).max);
    }

    function _stateToDepositAsOwner() internal {
        vm.prank(owner);
        vault.stateToDeposit();
    }

    function _stateToRunningAsOwner() internal {
        vm.startPrank(owner);
        vault.stateToDeposit();
        vault.stateToRunning();
        vm.stopPrank();
    }

    function _stateToWithdrawAsOwner() internal {
        vm.startPrank(owner);
        vault.stateToDeposit();
        vault.stateToRunning();
        vault.stateToWithdraw();
        vm.stopPrank();
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.prank(user);
        vault.deposit(amount);
    }

    function _reinitVault(uint256 newMaxShareholders) internal {
        vm.prank(owner);
        vault = new Vault(
            address(token1),
            address(token2),
            newMaxShareholders,
            manager
        );

        vm.prank(alith);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(baltathar);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(carol);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(owner);
        token1.approve(address(vault), type(uint256).max);
        vm.prank(stranger);
        token1.approve(address(vault), type(uint256).max);
    }

    function _allShareholders() internal view returns (address[] memory) {
        return vault.getShareholders();
    }

    function test_Constructor_SetsStateCorrectly() public view {
        assertEq(address(vault.token1()), address(token1));
        assertEq(address(vault.token2()), address(token2));
        assertEq(vault.maxShareholders(), 3);
        assertEq(vault.manager(), manager);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
        assertFalse(vault.depositsClosed());
        assertEq(vault.totalShares(), 0);
    }

    function test_Constructor_RevertWhen_ZeroToken1() public {
        vm.expectRevert(Vault.Vault__ZeroAddress.selector);
        new Vault(address(0), address(token2), 3, manager);
    }

    function test_Constructor_RevertWhen_ZeroToken2() public {
        vm.expectRevert(Vault.Vault__ZeroAddress.selector);
        new Vault(address(token1), address(0), 3, manager);
    }

    function test_Constructor_RevertWhen_SameTokens() public {
        vm.expectRevert(Vault.Vault__SameTokens.selector);
        new Vault(address(token1), address(token1), 3, manager);
    }

    function test_Constructor_RevertWhen_ZeroMaxShareholders() public {
        vm.expectRevert(Vault.Vault__ZeroMaxShareholders.selector);
        new Vault(address(token1), address(token2), 0, manager);
    }

    function test_Constructor_RevertWhen_ZeroManager() public {
        vm.expectRevert(Vault.Vault__ZeroAddress.selector);
        new Vault(address(token1), address(token2), 3, address(0));
    }

    function test_StateTransition_ClosedToDeposit_ByOwner() public {
        vm.prank(owner);
        vault.stateToDeposit();

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Deposit));
    }

    function test_StateTransition_ClosedToDeposit_ByManager() public {
        vm.prank(manager);
        vault.stateToDeposit();

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Deposit));
    }

    function test_StateTransition_RevertWhen_NotOwnerOrManager() public {
        vm.prank(stranger);
        vm.expectRevert(Vault.Vault__NotOwnerOrManager.selector);
        vault.stateToDeposit();
    }

    function test_StateTransition_ForwardFlow_AndSnapshotCreation() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 200 ether);

        vm.prank(owner);
        vault.stateToRunning();
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Running));

        token1.mint(address(vault), 300 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Withdraw));
        assertEq(vault.withdrawalSnapshotShares(), 300 ether);
        assertEq(vault.withdrawalSnapshotBalance(), 600 ether);
    }

    function test_StateTransition_RevertWhen_InvalidTransition() public {
        vm.prank(owner);
        vm.expectRevert(Vault.Vault__InvalidStateTransition.selector);
        vault.stateToRunning();
    }

    function test_Deposit_SingleUser() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);

        assertEq(vault.shares(alith), 100 ether);
        assertEq(vault.totalShares(), 100 ether);
        assertEq(vault.getShareholderCount(), 1);
        assertEq(token1.balanceOf(address(vault)), 100 ether);
    }

    function test_Deposit_RevertWhen_NotDepositState() public {
        vm.prank(alith);
        vm.expectRevert(Vault.Vault__InvalidState.selector);
        vault.deposit(100 ether);
    }

    function test_Deposit_ClosesWhenMaxShareholdersReached() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 100 ether);

        vm.expectEmit(false, false, false, false);
        emit Vault.DepositsClosed();
        _depositAs(carol, 100 ether);

        assertTrue(vault.depositsClosed());
    }

    function test_Execute_RevertWhen_TargetNotAllowed() public {
        _stateToRunningAsOwner();

        bytes memory callData = abi.encodeWithSignature("totalSupply()");
        vm.prank(manager);
        vm.expectRevert(Vault.Vault__TargetNotAllowed.selector);
        vault.execute(address(foreignToken), callData);
    }

    function test_Execute_SucceedsWhen_TargetAllowed() public {
        _stateToRunningAsOwner();

        vm.prank(owner);
        vault.addAllowedTarget(address(foreignToken));

        foreignToken.mint(address(this), 50 ether);
        bytes memory callData = abi.encodeWithSignature("totalSupply()");

        vm.prank(manager);
        bytes memory result = vault.execute(address(foreignToken), callData);
        uint256 supply = abi.decode(result, (uint256));
        assertEq(supply, 50 ether);
    }

    function test_AllowedTarget_ManageByOwnerOnly() public {
        vm.prank(stranger);
        vm.expectRevert();
        vault.addAllowedTarget(address(foreignToken));

        vm.prank(owner);
        vault.addAllowedTarget(address(foreignToken));
        assertTrue(vault.allowedTargets(address(foreignToken)));

        vm.prank(owner);
        vault.removeAllowedTarget(address(foreignToken));
        assertFalse(vault.allowedTargets(address(foreignToken)));
    }

    function test_UserWithdraw_DepositState_ExactRefund() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);

        vm.prank(alith);
        vault.userWithdraw();

        assertEq(vault.shares(alith), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(vault.getShareholderCount(), 0);
        assertEq(token1.balanceOf(alith), 1_000 ether);
    }

    function test_UserWithdraw_DepositState_ReopensAfterCapDrop() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 100 ether);
        _depositAs(carol, 100 ether);
        assertTrue(vault.depositsClosed());

        vm.prank(carol);
        vault.userWithdraw();

        assertFalse(vault.depositsClosed());
        assertEq(vault.getShareholderCount(), 2);
    }

    function test_UserWithdraw_WithdrawState_ProportionalBySnapshot() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 100 ether);

        vm.prank(owner);
        vault.stateToRunning();

        token1.mint(address(vault), 200 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        vm.prank(alith);
        vault.userWithdraw();

        vm.prank(baltathar);
        vault.userWithdraw();

        assertEq(token1.balanceOf(alith), 1_000 ether - 100 ether + 200 ether);
        assertEq(
            token1.balanceOf(baltathar),
            1_000 ether - 100 ether + 200 ether
        );
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_Withdraw_ManagerBatch_UsesSnapshot() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 200 ether);
        _depositAs(carol, 300 ether);

        vm.prank(owner);
        vault.stateToRunning();

        token1.mint(address(vault), 600 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        address[] memory batch1 = new address[](1);
        batch1[0] = alith;
        vm.prank(manager);
        vault.withdraw(batch1);

        token1.mint(address(vault), 1_000 ether);

        address[] memory batch2 = new address[](2);
        batch2[0] = baltathar;
        batch2[1] = carol;
        vm.prank(manager);
        vault.withdraw(batch2);

        assertEq(token1.balanceOf(alith), 1_000 ether - 100 ether + 200 ether);
        assertEq(
            token1.balanceOf(baltathar),
            1_000 ether - 200 ether + 400 ether
        );
        assertEq(
            token1.balanceOf(carol),
            1_000 ether - 300 ether + 600 ether + 1_000 ether
        );
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_Withdraw_RevertWhen_NotWithdrawState() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);

        address[] memory batch = _allShareholders();
        vm.prank(manager);
        vm.expectRevert(Vault.Vault__InvalidState.selector);
        vault.withdraw(batch);
    }

    function test_UpdateVault_WhenNoShareholders() public {
        MockERC20 newToken1 = new MockERC20("New1", "N1");
        MockERC20 newToken2 = new MockERC20("New2", "N2");

        vm.prank(manager);
        vault.updateVault(address(newToken1), address(newToken2), 10);

        assertEq(address(vault.token1()), address(newToken1));
        assertEq(address(vault.token2()), address(newToken2));
        assertEq(vault.maxShareholders(), 10);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_UpdateVault_RevertWhen_HasShareholdersAndNotClosed() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);

        vm.prank(manager);
        vm.expectRevert(Vault.Vault__VaultMustBeClosedOrEmpty.selector);
        vault.updateVault(address(token1), address(token2), 5);
    }

    function test_FullLifecycle_DepositRunWithdrawReuse() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 300 ether);
        _depositAs(baltathar, 300 ether);

        vm.prank(owner);
        vault.stateToRunning();

        vm.prank(owner);
        vault.stateToWithdraw();

        address[] memory batch = _allShareholders();
        vm.prank(manager);
        vault.withdraw(batch);

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));

        MockERC20 newToken1 = new MockERC20("NT1", "NT1");
        MockERC20 newToken2 = new MockERC20("NT2", "NT2");

        vm.prank(manager);
        vault.updateVault(address(newToken1), address(newToken2), 5);

        vm.prank(owner);
        vault.stateToDeposit();

        newToken1.mint(alith, 500 ether);
        vm.prank(alith);
        newToken1.approve(address(vault), type(uint256).max);
        vm.prank(alith);
        vault.deposit(100 ether);

        assertEq(vault.shares(alith), 100 ether);
    }

    function test_Plan_Deposits_MultipleShooters() public {
        _reinitVault(5);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 2_000 ether);

        _stateToDepositAsOwner();

        _depositAs(alith, 1_000 ether);
        _depositAs(baltathar, 2_000 ether);
        _depositAs(carol, 3_000 ether);
        _depositAs(owner, 5_000 ether);
        _depositAs(owner, 2_500 ether);

        assertEq(vault.totalShares(), 13_500 ether);
        assertEq(vault.shares(alith), 1_000 ether);
        assertEq(vault.shares(baltathar), 2_000 ether);
        assertEq(vault.shares(carol), 3_000 ether);
        assertEq(vault.shares(owner), 7_500 ether);
        assertEq(vault.getShareholderCount(), 4);
        assertEq(token1.balanceOf(address(vault)), 13_500 ether);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Deposit));
    }

    function test_Plan_UserWithdraw_InDepositState() public {
        _reinitVault(5);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 2_000 ether);

        _stateToDepositAsOwner();

        _depositAs(alith, 1_000 ether);
        _depositAs(baltathar, 2_000 ether);
        _depositAs(carol, 3_000 ether);
        _depositAs(owner, 7_500 ether);

        vm.prank(alith);
        vault.userWithdraw();

        assertEq(vault.shares(alith), 0);
        assertEq(vault.totalShares(), 12_500 ether);
        assertEq(token1.balanceOf(address(vault)), 12_500 ether);
        assertEq(token1.balanceOf(alith), 1_000 ether);
        assertEq(vault.getShareholderCount(), 3);
    }

    function test_Plan_TransitionToRunning_ThenWithdraw_WithSnapshot() public {
        _reinitVault(5);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 2_000 ether);

        _stateToDepositAsOwner();

        _depositAs(alith, 1_000 ether);
        _depositAs(baltathar, 2_000 ether);
        _depositAs(carol, 3_000 ether);
        _depositAs(owner, 7_500 ether);

        vm.prank(alith);
        vault.userWithdraw();

        vm.prank(owner);
        vault.stateToRunning();

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Running));
        assertEq(vault.withdrawalSnapshotShares(), 0);
        assertEq(vault.withdrawalSnapshotBalance(), 0);

        token1.mint(address(vault), 2_500 ether);
        assertEq(token1.balanceOf(address(vault)), 15_000 ether);
        assertEq(vault.totalShares(), 12_500 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Withdraw));
        assertEq(vault.withdrawalSnapshotShares(), 12_500 ether);
        assertEq(vault.withdrawalSnapshotBalance(), 15_000 ether);
        assertEq(vault.totalShares(), 12_500 ether);
    }

    function test_Plan_UserWithdraw_ProRataInWithdrawState() public {
        _reinitVault(5);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 2_000 ether);

        _stateToDepositAsOwner();

        _depositAs(alith, 1_000 ether);
        _depositAs(baltathar, 2_000 ether);
        _depositAs(carol, 3_000 ether);
        _depositAs(owner, 7_500 ether);

        vm.prank(alith);
        vault.userWithdraw();

        vm.prank(owner);
        vault.stateToRunning();

        token1.mint(address(vault), 2_500 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        vm.prank(carol);
        vault.userWithdraw();
        assertEq(
            token1.balanceOf(carol),
            3_000 ether - 3_000 ether + 3_600 ether
        );
        assertEq(vault.shares(carol), 0);
        assertEq(vault.totalShares(), 9_500 ether);
        assertEq(token1.balanceOf(address(vault)), 11_400 ether);

        vm.prank(baltathar);
        vault.userWithdraw();
        assertEq(
            token1.balanceOf(baltathar),
            2_000 ether - 2_000 ether + 2_400 ether
        );
        assertEq(vault.shares(baltathar), 0);
        assertEq(vault.totalShares(), 7_500 ether);
        assertEq(token1.balanceOf(address(vault)), 9_000 ether);

        vm.prank(owner);
        vault.userWithdraw();
        assertEq(
            token1.balanceOf(owner),
            10_000 ether - 7_500 ether + 9_000 ether
        );
        assertEq(vault.shares(owner), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(token1.balanceOf(address(vault)), 0);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_Plan_ManagerBatchWithdraw_MultipleUsers() public {
        _reinitVault(5);
        token1.mint(baltathar, 1_000 ether);
        token1.mint(carol, 2_000 ether);

        _stateToDepositAsOwner();

        _depositAs(alith, 1_000 ether);
        _depositAs(baltathar, 2_000 ether);
        _depositAs(carol, 3_000 ether);
        _depositAs(owner, 7_500 ether);

        vm.prank(alith);
        vault.userWithdraw();

        vm.prank(owner);
        vault.stateToRunning();

        token1.mint(address(vault), 2_500 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        vm.prank(carol);
        vault.userWithdraw();

        address[] memory batch = new address[](2);
        batch[0] = baltathar;
        batch[1] = owner;

        vm.prank(manager);
        vault.withdraw(batch);

        assertEq(
            token1.balanceOf(baltathar),
            2_000 ether - 2_000 ether + 2_400 ether
        );
        assertEq(
            token1.balanceOf(owner),
            10_000 ether - 7_500 ether + 9_000 ether
        );
        assertEq(vault.totalShares(), 0);
        assertEq(token1.balanceOf(address(vault)), 0);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_Plan_ReopenDeposit_ThenUpdateVaultConfig() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 100 ether);

        vm.prank(owner);
        vault.stateToRunning();

        vm.prank(owner);
        vault.stateToWithdraw();

        address[] memory batch = _allShareholders();
        vm.prank(manager);
        vault.withdraw(batch);

        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
        assertEq(vault.totalShares(), 0);

        vm.prank(owner);
        vault.stateToDeposit();
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Deposit));

        MockERC20 newToken1 = new MockERC20("Updated1", "UP1");
        MockERC20 newToken2 = new MockERC20("Updated2", "UP2");
        vm.prank(owner);
        vault.updateVault(address(newToken1), address(newToken2), 11);

        assertEq(address(vault.token1()), address(newToken1));
        assertEq(address(vault.token2()), address(newToken2));
        assertEq(vault.maxShareholders(), 11);
        assertEq(uint256(vault.state()), uint256(Vault.VaultState.Closed));
    }

    function test_Plan_Edge_DepositRevertWhenMaxShareholdersReached() public {
        _stateToDepositAsOwner();

        _depositAs(alith, 1 ether);
        _depositAs(baltathar, 1 ether);
        _depositAs(carol, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(Vault.Vault__MaxShareholdersReached.selector);
        vault.deposit(1 ether);
    }

    function test_Plan_Edge_UserWithdrawRevertInRunningState() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 10 ether);

        vm.prank(owner);
        vault.stateToRunning();

        vm.prank(alith);
        vm.expectRevert(Vault.Vault__InvalidState.selector);
        vault.userWithdraw();
    }

    function test_Plan_Edge_StateToWithdrawRevertWhenNotRunning() public {
        _stateToDepositAsOwner();

        vm.prank(owner);
        vm.expectRevert(Vault.Vault__InvalidStateTransition.selector);
        vault.stateToWithdraw();
    }

    function test_Plan_Edge_WithdrawWithZeroSharesIsNoopForThatUser() public {
        _stateToDepositAsOwner();
        _depositAs(alith, 100 ether);
        _depositAs(baltathar, 200 ether);

        vm.prank(owner);
        vault.stateToRunning();

        token1.mint(address(vault), 300 ether);

        vm.prank(owner);
        vault.stateToWithdraw();

        address[] memory batch = new address[](2);
        batch[0] = stranger;
        batch[1] = baltathar;

        uint256 beforeVaultBalance = token1.balanceOf(address(vault));
        uint256 beforeStrangerBalance = token1.balanceOf(stranger);

        vm.prank(manager);
        vault.withdraw(batch);

        assertEq(token1.balanceOf(stranger), beforeStrangerBalance);
        assertEq(vault.shares(stranger), 0);
        assertEq(
            token1.balanceOf(address(vault)),
            beforeVaultBalance - 400 ether
        );
    }

    function test_Plan_Edge_UpdateVaultRevertWhenZeroTokenAddress() public {
        vm.prank(owner);
        vm.expectRevert(Vault.Vault__ZeroAddress.selector);
        vault.updateVault(address(0), address(token2), 5);
    }
}
