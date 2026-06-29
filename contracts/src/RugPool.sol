// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MemberRegistry.sol";
import "./VRFConsumer.sol";
import "./Treasury.sol";

contract RugPool is Ownable, ReentrancyGuard {
    struct CoinState {
        address tokenAddress;
        address creator;
        uint256 currentCycle;
        uint256 cycleStartTime;
        uint256 cycleDuration;
        uint8 exitProbability;
        bool active;
        uint256 totalHolders;
        uint256 poolValue;
        uint256 totalSupply;
    }

    struct HolderInfo {
        uint256 cycleJoined;
        uint256 joinTimestamp;
        uint256 tokenBalance;
        bool isActive;
    }

    struct ExitQueueEntry {
        address wallet;
        uint256 cycleJoined;
        uint256 joinTimestamp;
        uint256 tokenBalance;
    }

    mapping(address => CoinState) public coins;
    mapping(address => mapping(address => HolderInfo)) public holders;
    mapping(address => address[]) public coinHolders;
    mapping(address => bool) public registeredCoins;

    address public memberRegistry;
    address public vrfConsumer;
    address public treasury;
    address public coinFactory;

    uint256 public EXIT_DELAY = 10 seconds;
    uint256 public PROTOCOL_FEE_BPS = 2000;

    event CoinRegistered(address indexed tokenAddress, address indexed creator, uint8 exitProbability);
    event TokensPurchased(address indexed coinAddress, address indexed buyer, uint256 monAmount, uint256 tokensOut);
    event FlipTriggered(address indexed coinAddress, uint256 cycleNumber);
    event CycleCompleted(
        address indexed coinAddress,
        uint256 cycleNumber,
        uint256 headsCount,
        uint256 tailsCount,
        uint256 totalSacrificed,
        uint256 totalPaidOut
    );

    constructor() Ownable(msg.sender) {}

    modifier onlyCoinFactory() {
        require(msg.sender == coinFactory, "Only coin factory");
        _;
    }

    modifier onlyVRF() {
        require(msg.sender == vrfConsumer, "Only VRF");
        _;
    }

    function registerCoin(
        address tokenAddress,
        address creator,
        uint8 exitProbability,
        uint256 initialPoolValue
    ) external onlyCoinFactory {
        require(
            exitProbability == 33 || exitProbability == 50 || exitProbability == 70 || exitProbability == 80,
            "Invalid exit probability"
        );
        require(!registeredCoins[tokenAddress], "Already registered");

        uint256 supply = IERC20(tokenAddress).totalSupply();

        coins[tokenAddress] = CoinState({
            tokenAddress: tokenAddress,
            creator: creator,
            currentCycle: 1,
            cycleStartTime: block.timestamp,
            cycleDuration: 86400,
            exitProbability: exitProbability,
            active: true,
            totalHolders: 0,
            poolValue: initialPoolValue,
            totalSupply: supply
        });

        registeredCoins[tokenAddress] = true;

        emit CoinRegistered(tokenAddress, creator, exitProbability);
    }

    function buy(address coinAddress, uint256 minTokensOut) external payable nonReentrant {
        require(MemberRegistry(memberRegistry).isRegistered(msg.sender), "Not registered");
        CoinState storage coin = coins[coinAddress];
        require(coin.active, "Coin not active");
        require(msg.value > 0, "Zero value");
        require(registeredCoins[coinAddress], "Coin not registered");

        uint256 tokensOut = (msg.value * coin.totalSupply) / coin.poolValue;
        require(tokensOut >= minTokensOut, "Slippage too high");

        coin.poolValue += msg.value;

        IERC20(coin.tokenAddress).transfer(msg.sender, tokensOut);

        HolderInfo storage holder = holders[coinAddress][msg.sender];

        if (holder.tokenBalance == 0) {
            holder.cycleJoined = coin.currentCycle;
            holder.joinTimestamp = block.timestamp;
            coinHolders[coinAddress].push(msg.sender);
            coin.totalHolders++;
        }

        holder.tokenBalance += tokensOut;
        holder.isActive = true;

        emit TokensPurchased(coinAddress, msg.sender, msg.value, tokensOut);
    }

    function triggerFlip(address coinAddress) external payable {
        require(msg.value >= VRFConsumer(vrfConsumer).getRequestFee(), "Insufficient VRF fee");
        CoinState storage coin = coins[coinAddress];
        require(coin.active, "Coin not active");
        require(block.timestamp >= coin.cycleStartTime + coin.cycleDuration, "Cycle not ended");
        require(coin.totalHolders > 0, "No holders");

        bytes32 userRandom = keccak256(abi.encodePacked(block.timestamp, coinAddress, coin.currentCycle));
        VRFConsumer(vrfConsumer).requestRandomness{value: msg.value}(coinAddress, coin.currentCycle, userRandom);

        emit FlipTriggered(coinAddress, coin.currentCycle);
    }

    function onRandomnessFulfilled(address coinAddress, uint256 cycleNumber, bytes32 seed) external onlyVRF {
        CoinState storage coin = coins[coinAddress];
        require(coin.active, "Coin not active");

        address[] storage holdersList = coinHolders[coinAddress];
        uint256 headsCount = 0;
        uint256 tailsCount = 0;
        uint256 totalSacrificed = 0;
        uint256 totalPaidOut = 0;

        uint256 activeCount = 0;
        for (uint256 i = 0; i < holdersList.length; i++) {
            if (holders[coinAddress][holdersList[i]].isActive) {
                activeCount++;
            }
        }

        ExitQueueEntry[] memory queue = new ExitQueueEntry[](activeCount);
        uint256 queueIdx = 0;

        for (uint256 i = 0; i < holdersList.length; i++) {
            address wallet = holdersList[i];
            HolderInfo storage holder = holders[coinAddress][wallet];

            if (!holder.isActive || holder.tokenBalance == 0) continue;

            bool isHeads = VRFConsumer(vrfConsumer).deriveOutcome(
                seed, wallet, coin.currentCycle, coin.exitProbability
            );

            if (isHeads) {
                headsCount++;
                queue[queueIdx] = ExitQueueEntry({
                    wallet: wallet,
                    cycleJoined: holder.cycleJoined,
                    joinTimestamp: holder.joinTimestamp,
                    tokenBalance: holder.tokenBalance
                });
                queueIdx++;
            } else {
                tailsCount++;
                uint256 sacrificeValue = (holder.tokenBalance * coin.poolValue) / coin.totalSupply;
                totalSacrificed += sacrificeValue;

                holder.isActive = false;

                Treasury(treasury).recordLoss(wallet, sacrificeValue);
            }
        }

        coin.poolValue += totalSacrificed;

        for (uint256 i = 0; i < queueIdx; i++) {
            for (uint256 j = i + 1; j < queueIdx; j++) {
                if (
                    queue[j].cycleJoined < queue[i].cycleJoined ||
                    (queue[j].cycleJoined == queue[i].cycleJoined && queue[j].joinTimestamp < queue[i].joinTimestamp)
                ) {
                    ExitQueueEntry memory tmp = queue[i];
                    queue[i] = queue[j];
                    queue[j] = tmp;
                }
            }
        }

        for (uint256 i = 0; i < queueIdx; i++) {
            ExitQueueEntry memory entry = queue[i];

            uint256 monOut = (entry.tokenBalance * coin.poolValue) / coin.totalSupply;
            coin.poolValue -= monOut;

            uint256 protocolFee = monOut * PROTOCOL_FEE_BPS / 10000;
            uint256 userPayout = monOut - protocolFee;

            (bool success, ) = entry.wallet.call{value: userPayout}("");
            require(success, "Exit transfer failed");

            Treasury(treasury).receiveProtocolFee{value: protocolFee}();

            totalPaidOut += monOut;

            holders[coinAddress][entry.wallet].isActive = false;
        }

        coin.currentCycle++;
        coin.cycleStartTime = block.timestamp;

        emit CycleCompleted(coinAddress, cycleNumber, headsCount, tailsCount, totalSacrificed, totalPaidOut);
    }

    function getBuyQuote(address coinAddress, uint256 monAmount) public view returns (uint256 tokensOut) {
        CoinState storage coin = coins[coinAddress];
        if (coin.poolValue == 0 || coin.totalSupply == 0) return 0;
        tokensOut = (monAmount * coin.totalSupply) / coin.poolValue;
    }

    function getSellQuote(address coinAddress, uint256 tokenAmount) public view returns (uint256 monOut) {
        CoinState storage coin = coins[coinAddress];
        if (coin.totalSupply == 0) return 0;
        monOut = (tokenAmount * coin.poolValue) / coin.totalSupply;
    }

    function getHolderInfo(address coinAddress, address wallet) external view returns (HolderInfo memory) {
        return holders[coinAddress][wallet];
    }

    function getCoinState(address coinAddress) external view returns (CoinState memory) {
        return coins[coinAddress];
    }

    function getCoinHolders(address coinAddress) external view returns (address[] memory) {
        return coinHolders[coinAddress];
    }

    function getExitQueue(address coinAddress) public view returns (ExitQueueEntry[] memory) {
        address[] storage holdersList = coinHolders[coinAddress];
        uint256 activeCount = 0;
        for (uint256 i = 0; i < holdersList.length; i++) {
            if (holders[coinAddress][holdersList[i]].isActive) {
                activeCount++;
            }
        }

        ExitQueueEntry[] memory queue = new ExitQueueEntry[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < holdersList.length; i++) {
            address wallet = holdersList[i];
            HolderInfo storage holder = holders[coinAddress][wallet];
            if (holder.isActive) {
                queue[idx] = ExitQueueEntry({
                    wallet: wallet,
                    cycleJoined: holder.cycleJoined,
                    joinTimestamp: holder.joinTimestamp,
                    tokenBalance: holder.tokenBalance
                });
                idx++;
            }
        }

        for (uint256 i = 0; i < activeCount; i++) {
            for (uint256 j = i + 1; j < activeCount; j++) {
                if (
                    queue[j].cycleJoined < queue[i].cycleJoined ||
                    (queue[j].cycleJoined == queue[i].cycleJoined && queue[j].joinTimestamp < queue[i].joinTimestamp)
                ) {
                    ExitQueueEntry memory tmp = queue[i];
                    queue[i] = queue[j];
                    queue[j] = tmp;
                }
            }
        }

        return queue;
    }

    function isFlipReady(address coinAddress) external view returns (bool) {
        CoinState storage coin = coins[coinAddress];
        return coin.active && block.timestamp >= coin.cycleStartTime + coin.cycleDuration && coin.totalHolders > 0;
    }

    function setMemberRegistry(address _memberRegistry) external onlyOwner {
        memberRegistry = _memberRegistry;
    }

    function setVRFConsumer(address _vrfConsumer) external onlyOwner {
        vrfConsumer = _vrfConsumer;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setCoinFactory(address _coinFactory) external onlyOwner {
        coinFactory = _coinFactory;
    }

    function setExitDelay(uint256 _exitDelay) external onlyOwner {
        EXIT_DELAY = _exitDelay;
    }

    function setCycleDuration(address coinAddress, uint256 newDuration) external onlyOwner {
        require(registeredCoins[coinAddress], "Coin not registered");
        coins[coinAddress].cycleDuration = newDuration;
    }
}
