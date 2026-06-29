// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Treasury is Ownable {
    address public devWallet;
    address public rugPool;

    struct MonthlyPeriod {
        uint256 startTime;
        uint256 endTime;
        uint256 totalAccumulated;
        uint256 devShare;
        uint256 topLoserShare;
        uint256 rollover;
        address topLoser;
        uint256 topLoserAmount;
        bool settled;
    }

    mapping(uint256 => MonthlyPeriod) public periods;
    mapping(uint256 => mapping(address => uint256)) public periodUserLoss;
    mapping(uint256 => address[]) public periodLosers;
    mapping(uint256 => mapping(address => bool)) public hasLossInPeriod;

    uint256 public currentPeriod;
    uint256 public pendingFees;
    uint256 public totalFeesAllTime;

    address private _currentTopLoser;
    uint256 private _currentTopLossAmount;

    event FeeReceived(uint256 amount, uint256 periodTotal, uint256 timestamp);
    event LossRecorded(address indexed wallet, uint256 amount, uint256 periodTotal);
    event MonthSettled(
        uint256 indexed periodId,
        address topLoser,
        uint256 topLoserPrize,
        uint256 devShare,
        uint256 rollover
    );

    constructor(address _devWallet) Ownable(msg.sender) {
        devWallet = _devWallet;
        currentPeriod = 1;
        periods[1] = MonthlyPeriod({
            startTime: block.timestamp,
            endTime: block.timestamp + 30 days,
            totalAccumulated: 0,
            devShare: 0,
            topLoserShare: 0,
            rollover: 0,
            topLoser: address(0),
            topLoserAmount: 0,
            settled: false
        });
    }

    function receiveProtocolFee() external payable {
        require(msg.sender == rugPool, "Only rug pool");
        pendingFees += msg.value;
        totalFeesAllTime += msg.value;
        periods[currentPeriod].totalAccumulated += msg.value;
        emit FeeReceived(msg.value, periods[currentPeriod].totalAccumulated, block.timestamp);
    }

    function recordLoss(address wallet, uint256 lossAmount) external {
        require(msg.sender == rugPool, "Only rug pool");

        periodUserLoss[currentPeriod][wallet] += lossAmount;
        uint256 currentLoss = periodUserLoss[currentPeriod][wallet];

        if (!hasLossInPeriod[currentPeriod][wallet]) {
            hasLossInPeriod[currentPeriod][wallet] = true;
            periodLosers[currentPeriod].push(wallet);
        }

        if (currentLoss > _currentTopLossAmount) {
            _currentTopLoser = wallet;
            _currentTopLossAmount = currentLoss;
        }

        emit LossRecorded(wallet, lossAmount, currentLoss);
    }

    function settleMonth() external onlyOwner {
        MonthlyPeriod storage period = periods[currentPeriod];
        require(block.timestamp >= period.endTime, "Period not ended");
        require(!period.settled, "Already settled");

        uint256 total = period.totalAccumulated;
        period.devShare = total * 10 / 100;
        period.topLoserShare = total * 10 / 100;
        period.rollover = total * 80 / 100;
        period.topLoser = _currentTopLoser;
        period.topLoserAmount = _currentTopLossAmount;
        period.settled = true;

        if (period.devShare > 0) {
            (bool devSuccess, ) = devWallet.call{value: period.devShare}("");
            require(devSuccess, "Dev transfer failed");
        }

        if (period.topLoserShare > 0 && _currentTopLoser != address(0)) {
            (bool loserSuccess, ) = _currentTopLoser.call{value: period.topLoserShare}("");
            require(loserSuccess, "Loser transfer failed");
        }

        uint256 payout = period.devShare + period.topLoserShare;
        pendingFees -= payout;

        emit MonthSettled(currentPeriod, _currentTopLoser, period.topLoserShare, period.devShare, period.rollover);

        currentPeriod++;
        periods[currentPeriod] = MonthlyPeriod({
            startTime: block.timestamp,
            endTime: block.timestamp + 30 days,
            totalAccumulated: period.rollover,
            devShare: 0,
            topLoserShare: 0,
            rollover: 0,
            topLoser: address(0),
            topLoserAmount: 0,
            settled: false
        });

        _currentTopLoser = address(0);
        _currentTopLossAmount = 0;
    }

    function getCurrentTopLoser() external view returns (address wallet, uint256 amount) {
        return (_currentTopLoser, _currentTopLossAmount);
    }

    function getUserLoss(address wallet) external view returns (uint256) {
        return periodUserLoss[currentPeriod][wallet];
    }

    function getPeriodUserLoss(uint256 periodId, address wallet) external view returns (uint256) {
        return periodUserLoss[periodId][wallet];
    }

    function getPeriod(uint256 periodId) external view returns (MonthlyPeriod memory) {
        return periods[periodId];
    }

    function getPendingFees() external view returns (uint256) {
        return pendingFees;
    }

    function setDevWallet(address _devWallet) external onlyOwner {
        devWallet = _devWallet;
    }

    function setRugPool(address _rugPool) external onlyOwner {
        rugPool = _rugPool;
    }
}
