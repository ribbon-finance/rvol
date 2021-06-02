//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Welford} from "../libraries/Welford.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {VolOracle} from "../core/VolOracle.sol";
import "hardhat/console.sol";

contract TestVolOracle is DSMath, VolOracle {
    using SafeMath for uint256;
    uint256 private _price;

    constructor(
        address _pool,
        address _baseCurrency,
        address _quoteCurrency,
        uint32 _period
    ) VolOracle(_pool, _baseCurrency, _quoteCurrency, _period) {}

    function mockCommit() external {
        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();
        require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 price = mockTwap();
        uint256 _lastPrice = lastPrice;
        // Result of the division is 10**18, but we scale down to 10**10 so it fits into uint112
        uint256 periodReturn =
            _lastPrice > 0 ? wdiv(price, _lastPrice).div(10**10) : 0;
        Accumulator storage accum = accumulator;

        require(
            block.timestamp >=
                accum.lastTimestamp + period - commitPhaseDuration,
            "Committed"
        );

        (uint256 newCount, uint256 newMean, uint256 newM2) =
            Welford.update(accum.count, accum.mean, accum.m2, periodReturn);

        accum.count = uint16(newCount);
        accum.mean = uint96(newMean);
        accum.m2 = uint112(newM2);
        accum.lastTimestamp = commitTimestamp;
        lastPrice = price;

        emit Commit(
            uint16(newCount),
            uint32(commitTimestamp),
            uint96(newMean),
            uint112(newM2),
            price,
            msg.sender
        );
    }

    function mockTwap() private view returns (uint256) {
        return _price;
    }

    function setPrice(uint256 price) public {
        _price = price;
    }
}
