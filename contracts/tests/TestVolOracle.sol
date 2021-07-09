//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Welford} from "../libraries/Welford.sol";
import {DSMath} from "../libraries/DSMath.sol";
import {VolOracle} from "../core/VolOracle.sol";
import {Math} from "../libraries/Math.sol";
import {PRBMathSD59x18} from "../libraries/PRBMathSD59x18.sol";

contract TestVolOracle is DSMath, VolOracle {
    using SafeMath for uint256;
    uint256 private _price;

    constructor(uint32 _period) VolOracle(_period) {}

    function mockCommit(address pool) external {
        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();
        require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 price = mockTwap();
        uint256 _lastPrice = lastPrices[pool];
        uint256 periodReturn = _lastPrice > 0 ? wdiv(price, _lastPrice) : 0;

        // logReturn is in 10**18
        // we need to scale it down to 10**8
        int256 logReturn =
            periodReturn > 0
                ? PRBMathSD59x18.ln(int256(periodReturn)) / 10**10
                : 0;

        Accumulator storage accum = accumulators[pool];

        require(
            block.timestamp >=
                accum.lastTimestamp + period - commitPhaseDuration,
            "Committed"
        );

        (uint256 newCount, int256 newMean, uint256 newM2) =
            Welford.update(accum.count, accum.mean, accum.m2, logReturn);

        require(newCount < type(uint16).max, ">U16");
        require(newMean < type(int96).max, ">U96");
        require(newM2 < type(uint112).max, ">U112");

        accum.count = uint16(newCount);
        accum.mean = int96(newMean);
        accum.m2 = uint112(newM2);
        accum.lastTimestamp = commitTimestamp;
        lastPrices[pool] = price;

        emit Commit(
            uint16(newCount),
            uint32(commitTimestamp),
            int96(newMean),
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
