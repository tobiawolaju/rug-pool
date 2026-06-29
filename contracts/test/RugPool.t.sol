// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/RugPool.sol";
import "../src/RugToken.sol";

contract MockMemberRegistry {
    mapping(address => bool) public registered;

    function setRegistered(address wallet, bool status) external {
        registered[wallet] = status;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return registered[wallet];
    }
}

contract MockVRFConsumer {
    mapping(address => bool) public outcomes;
    bool public defaultOutcome;
    address public lastCaller;
    uint256 public callCount;

    function setOutcome(address wallet, bool isHeads) external {
        outcomes[wallet] = isHeads;
    }

    function getRequestFee() external pure returns (uint256) {
        return 0;
    }

    function deriveOutcome(bytes32, address wallet, uint256, uint8) external view returns (bool) {
        if (outcomes[wallet]) return true;
        return defaultOutcome;
    }

    function requestRandomness(address, uint256, bytes32) external payable returns (uint64) {
        lastCaller = msg.sender;
        callCount++;
        return uint64(callCount);
    }
}

contract MockTreasury {
    uint256 public totalFeesReceived;
    address public lastLossWallet;
    uint256 public lastLossAmount;

    function receiveProtocolFee() external payable {
        totalFeesReceived += msg.value;
    }

    function recordLoss(address wallet, uint256 lossAmount) external {
        lastLossWallet = wallet;
        lastLossAmount = lossAmount;
    }
}

contract MockCoinFactory {
    RugPool public rugPool;
    uint256 public callCount;

    constructor(RugPool _rugPool) {
        rugPool = _rugPool;
    }

    function registerCoin(address tokenAddress, address creator, uint8 exitProbability, uint256 initialPoolValue) external {
        callCount++;
        rugPool.registerCoin(tokenAddress, creator, exitProbability, initialPoolValue);
    }
}

contract RugPoolTest is Test {
    RugPool public rugPool;
    MockMemberRegistry public mockRegistry;
    MockVRFConsumer public mockVRF;
    MockTreasury public mockTreasury;
    MockCoinFactory public mockFactory;
    RugToken public token;

    address public owner = address(0x1);
    address public alice = address(0xAAA);
    address public bob = address(0xBBB);
    address public carol = address(0xCCC);
    address public nonOwner = address(0x999);

    uint256 public constant SUPPLY = 1_000_000 ether;
    uint256 public constant INITIAL_POOL = 100 ether;

    function setUp() public {
        mockRegistry = new MockMemberRegistry();
        mockVRF = new MockVRFConsumer();
        mockTreasury = new MockTreasury();

        vm.prank(owner);
        rugPool = new RugPool();

        mockFactory = new MockCoinFactory(rugPool);

        vm.prank(owner);
        rugPool.setMemberRegistry(address(mockRegistry));
        vm.prank(owner);
        rugPool.setVRFConsumer(address(mockVRF));
        vm.prank(owner);
        rugPool.setTreasury(address(mockTreasury));
        vm.prank(owner);
        rugPool.setCoinFactory(address(mockFactory));

        token = new RugToken("TestCoin", "TST", SUPPLY, address(this));
        token.transfer(address(rugPool), SUPPLY);

        mockRegistry.setRegistered(alice, true);
        mockRegistry.setRegistered(bob, true);
        mockRegistry.setRegistered(carol, true);
    }

    // --- registerCoin tests ---

    function test_RegisterCoinByFactory() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        assertTrue(rugPool.registeredCoins(address(token)));
        RugPool.CoinState memory state = rugPool.getCoinState(address(token));
        assertEq(state.creator, alice);
        assertEq(state.exitProbability, 50);
        assertEq(state.poolValue, INITIAL_POOL);
        assertEq(state.totalSupply, SUPPLY);
        assertTrue(state.active);
    }

    function test_RevertWhen_RegisterCoinByNonFactory() public {
        vm.expectRevert("Only coin factory");
        vm.prank(nonOwner);
        rugPool.registerCoin(address(token), alice, 50, INITIAL_POOL);
    }

    function test_RevertWhen_RegisterCoinInvalidExitProbability() public {
        vm.expectRevert("Invalid exit probability");
        mockFactory.registerCoin(address(token), alice, 99, INITIAL_POOL);
    }

    // --- buy tests ---

    function test_BuyAsRegisteredMember() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);
        assertEq(token.balanceOf(alice), 10000 ether);
    }

    function test_RevertWhen_BuyAsUnregistered() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(nonOwner, 10 ether);
        vm.prank(nonOwner);
        vm.expectRevert("Not registered");
        rugPool.buy{value: 1 ether}(address(token), 0);
    }

    function test_RevertWhen_BuyWithZeroValue() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("Zero value");
        rugPool.buy{value: 0}(address(token), 0);
    }

    function test_BuyUpdatesPoolValue() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);
        RugPool.CoinState memory state = rugPool.getCoinState(address(token));
        assertEq(state.poolValue, INITIAL_POOL + 1 ether);
    }

    function test_BuySetsCycleJoinedAndTimestamp() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.warp(5000);
        rugPool.buy{value: 1 ether}(address(token), 0);
        RugPool.HolderInfo memory info = rugPool.getHolderInfo(address(token), alice);
        assertEq(info.cycleJoined, 1);
        assertEq(info.joinTimestamp, 5000);
    }

    function test_BuyPreservesCycleJoinedForExistingHolder() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 100 ether);
        vm.warp(1000);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);

        vm.warp(2000);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);

        RugPool.HolderInfo memory info = rugPool.getHolderInfo(address(token), alice);
        assertEq(info.cycleJoined, 1);
        assertEq(info.joinTimestamp, 1000);
        assertTrue(info.tokenBalance > 10000 ether);
    }

    // --- triggerFlip tests ---

    function test_RevertWhen_TriggerFlipBeforeCycleEnds() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);

        vm.expectRevert("Cycle not ended");
        rugPool.triggerFlip(address(token));
    }

    function test_TriggerFlipAfterCycleEnds() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);

        vm.warp(86401);
        vm.expectEmit(true, true, true, true);
        emit RugPool.FlipTriggered(address(token), 1);
        rugPool.triggerFlip(address(token));
        assertEq(mockVRF.callCount(), 1);
    }

    // --- getExitQueue tests ---

    function test_GetExitQueueSortedByCycleThenTimestamp() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        vm.warp(100);
        vm.prank(carol);
        rugPool.buy{value: 1 ether}(address(token), 0);

        vm.warp(200);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);

        vm.warp(300);
        vm.prank(bob);
        rugPool.buy{value: 1 ether}(address(token), 0);

        RugPool.ExitQueueEntry[] memory queue = rugPool.getExitQueue(address(token));

        assertEq(queue.length, 3);
        assertEq(queue[0].wallet, carol);
        assertEq(queue[1].wallet, alice);
        assertEq(queue[2].wallet, bob);
    }

    // --- isFlipReady tests ---

    function test_IsFlipReadyFalseBeforeDuration() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);
        assertFalse(rugPool.isFlipReady(address(token)));
    }

    function test_IsFlipReadyTrueAfterDuration() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        rugPool.buy{value: 1 ether}(address(token), 0);
        vm.warp(86401);
        assertTrue(rugPool.isFlipReady(address(token)));
    }

    // --- getBuyQuote tests ---

    function test_GetBuyQuoteReturnsCorrectAmount() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);
        uint256 tokensOut = rugPool.getBuyQuote(address(token), 1 ether);
        assertEq(tokensOut, (1 ether * SUPPLY) / INITIAL_POOL);
    }

    // --- onRandomnessFulfilled test ---

    function test_OnRandomnessFulfilled() public {
        mockFactory.registerCoin(address(token), alice, 50, INITIAL_POOL);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        vm.deal(address(rugPool), 300 ether);

        vm.warp(100);
        vm.prank(alice);
        rugPool.buy{value: 10 ether}(address(token), 0);

        vm.warp(200);
        vm.prank(bob);
        rugPool.buy{value: 10 ether}(address(token), 0);

        vm.warp(300);
        vm.prank(carol);
        rugPool.buy{value: 10 ether}(address(token), 0);

        vm.warp(86401);
        rugPool.triggerFlip(address(token));

        mockVRF.setOutcome(alice, true);
        mockVRF.setOutcome(bob, false);
        mockVRF.setOutcome(carol, true);

        uint256 bobTokens = rugPool.getHolderInfo(address(token), bob).tokenBalance;
        uint256 poolBefore = rugPool.getCoinState(address(token)).poolValue;
        uint256 bobValue = (bobTokens * poolBefore) / SUPPLY;

        vm.prank(address(mockVRF));
        rugPool.onRandomnessFulfilled(address(token), 1, keccak256("seed"));

        assertFalse(rugPool.getHolderInfo(address(token), bob).isActive);

        assertEq(mockTreasury.lastLossWallet(), bob);
        assertEq(mockTreasury.lastLossAmount(), bobValue);

        assertTrue(mockTreasury.totalFeesReceived() > 0);

        RugPool.CoinState memory state = rugPool.getCoinState(address(token));
        assertEq(state.currentCycle, 2);
    }
}
