// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/Treasury.sol";

contract MockRugPool {
    Treasury public treasury;

    constructor(Treasury _treasury) {
        treasury = _treasury;
    }

    function receiveProtocolFee() external payable {
        treasury.receiveProtocolFee{value: msg.value}();
    }

    function recordLoss(address wallet, uint256 lossAmount) external {
        treasury.recordLoss(wallet, lossAmount);
    }
}

contract TreasuryTest is Test {
    Treasury public treasury;
    MockRugPool public mockRugPool;
    address public owner = address(0x1);
    address public nonOwner = address(0x2);
    address public devWallet = address(0x999);
    address public userA = address(0xAAA);
    address public userB = address(0xBBB);

    uint256 public constant FEE_AMOUNT = 100 ether;

    function setUp() public {
        vm.prank(owner);
        treasury = new Treasury(devWallet);
        mockRugPool = new MockRugPool(treasury);

        vm.prank(owner);
        treasury.setRugPool(address(mockRugPool));
    }

    function test_ReceiveProtocolFeeAddsToPendingFees() public {
        vm.deal(address(mockRugPool), FEE_AMOUNT);
        vm.prank(address(mockRugPool));
        mockRugPool.receiveProtocolFee{value: FEE_AMOUNT}();
        assertEq(treasury.pendingFees(), FEE_AMOUNT);
    }

    function test_RevertWhen_ReceiveProtocolFeeNotRugPool() public {
        vm.deal(nonOwner, FEE_AMOUNT);
        vm.prank(nonOwner);
        vm.expectRevert("Only rug pool");
        treasury.receiveProtocolFee{value: FEE_AMOUNT}();
    }

    function test_RecordLossTracksUserLoss() public {
        vm.prank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 10 ether);
        assertEq(treasury.getUserLoss(userA), 10 ether);
    }

    function test_RecordLossUpdatesTopLoserOnNewHigh() public {
        vm.startPrank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 5 ether);
        (address top, uint256 amount) = treasury.getCurrentTopLoser();
        assertEq(top, userA);
        assertEq(amount, 5 ether);

        mockRugPool.recordLoss(userB, 15 ether);
        (top, amount) = treasury.getCurrentTopLoser();
        assertEq(top, userB);
        assertEq(amount, 15 ether);
        vm.stopPrank();
    }

    function test_GetCurrentTopLoserReturnsCorrect() public {
        vm.prank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 42 ether);
        (address top, uint256 amount) = treasury.getCurrentTopLoser();
        assertEq(top, userA);
        assertEq(amount, 42 ether);
    }

    function test_RevertWhen_SettleMonthBefore30Days() public {
        vm.expectRevert("Period not ended");
        vm.prank(owner);
        treasury.settleMonth();
    }

    function test_SettleMonthAfter30Days() public {
        vm.deal(address(mockRugPool), FEE_AMOUNT);
        vm.prank(address(mockRugPool));
        mockRugPool.receiveProtocolFee{value: FEE_AMOUNT}();

        vm.prank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 50 ether);

        uint256 devBefore = address(devWallet).balance;
        uint256 userABefore = address(userA).balance;
        uint256 treasuryBefore = address(treasury).balance;

        vm.warp(block.timestamp + 30 days);

        vm.prank(owner);
        treasury.settleMonth();

        assertEq(address(devWallet).balance - devBefore, FEE_AMOUNT * 10 / 100);
        assertEq(address(userA).balance - userABefore, FEE_AMOUNT * 10 / 100);
        assertEq(address(treasury).balance, treasuryBefore - (FEE_AMOUNT * 20 / 100));

        Treasury.MonthlyPeriod memory p1 = treasury.getPeriod(1);
        assertTrue(p1.settled);
        assertEq(p1.devShare, FEE_AMOUNT * 10 / 100);
        assertEq(p1.topLoserShare, FEE_AMOUNT * 10 / 100);
        assertEq(p1.rollover, FEE_AMOUNT * 80 / 100);
        assertEq(p1.topLoser, userA);
        assertEq(p1.topLoserAmount, 50 ether);

        assertEq(treasury.currentPeriod(), 2);
        Treasury.MonthlyPeriod memory p2 = treasury.getPeriod(2);
        assertEq(p2.totalAccumulated, FEE_AMOUNT * 80 / 100);
        assertEq(p2.startTime, block.timestamp);
        assertFalse(p2.settled);
    }

    function test_SettleMonthEmitsEvent() public {
        vm.deal(address(mockRugPool), FEE_AMOUNT);
        vm.prank(address(mockRugPool));
        mockRugPool.receiveProtocolFee{value: FEE_AMOUNT}();

        vm.prank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 10 ether);

        vm.warp(block.timestamp + 30 days);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit Treasury.MonthSettled(1, userA, FEE_AMOUNT * 10 / 100, FEE_AMOUNT * 10 / 100, FEE_AMOUNT * 80 / 100);
        treasury.settleMonth();
    }

    function test_GetUserLossReturnsCorrectAmount() public {
        vm.prank(address(mockRugPool));
        mockRugPool.recordLoss(userA, 7 ether);
        assertEq(treasury.getUserLoss(userA), 7 ether);
    }

    function test_SetDevWalletByOwner() public {
        address newDev = address(0x999);
        vm.prank(owner);
        treasury.setDevWallet(newDev);
        assertEq(treasury.devWallet(), newDev);
    }

    function test_RevertWhen_SetDevWalletByNonOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        treasury.setDevWallet(address(0x999));
    }

    function test_SetRugPoolByOwner() public {
        address newPool = address(0x888);
        vm.prank(owner);
        treasury.setRugPool(newPool);
        assertEq(treasury.rugPool(), newPool);
    }

    function test_RevertWhen_SetRugPoolByNonOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        treasury.setRugPool(address(0x888));
    }
}
