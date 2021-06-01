//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.3;

import {Welford} from "../libraries/Welford.sol";
import {VolOracle} from "../core/VolOracle.sol";

contract TestVolOracle is VolOracle {
    uint256 public price;

    constructor(
        address _pool,
        address _baseCurrency,
        address _quoteCurrency,
        uint32 _period
    ) VolOracle(_pool, _baseCurrency, _quoteCurrency, _period) {}

    function mockCommit() external {
        (uint32 commitTimestamp, uint32 gapFromPeriod) = secondsFromPeriod();
        require(gapFromPeriod < commitPhaseDuration, "Not commit phase");

        uint256 _price = mockTwap();
        Accumulator storage accum = accumulator;

        require(block.timestamp >= accum.lastTimestamp + period, "Committed");

        (uint256 newCount, uint256 newMean, uint256 newM2) =
            Welford.update(accum.count, accum.mean, accum.m2, _price);

        accum.count = uint16(newCount);
        accum.mean = uint96(newMean);
        accum.m2 = uint112(newM2);
        accum.lastTimestamp = commitTimestamp;
    }

    function mockTwap() private view returns (uint256) {
        return price;
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }
}
